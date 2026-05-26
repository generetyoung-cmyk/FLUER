"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { uploadTokenImage, prepareLaunch } from "@/lib/api/fluer";
import {
  validateTokenName,
  validateSymbol,
  cn,
  formatUSD,
  ensureFluerSuffix,
  stripFluerSuffix,
} from "@/lib/utils";
import {
  FLUER_SUFFIX,
  LAUNCHPAD,
  EXPLORER_URL,
} from "@/lib/constants";
import type { LaunchFormState, TokenCategory } from "@/lib/types";
import {
  UploadIcon,
  CheckIcon,
  CloseIcon,
  InfoIcon,
  ChevronDownIcon,
} from "@/components/ui/icons/NavIcons";

const CATEGORIES: { id: TokenCategory; label: string }[] = [
  { id: "Meme", label: "Meme" },
  { id: "DeFi", label: "DeFi" },
  { id: "AI", label: "AI" },
  { id: "Gaming", label: "Gaming" },
  { id: "RWA", label: "Real World Asset" },
  { id: "Social", label: "Social" },
  { id: "Infrastructure", label: "Infrastructure" },
  { id: "Other", label: "Other" },
];

type Step = "details" | "image" | "socials" | "review" | "sign" | "success";

const STEPS: { id: Step; label: string }[] = [
  { id: "details", label: "Token" },
  { id: "image", label: "Image" },
  { id: "socials", label: "Socials" },
  { id: "review", label: "Review" },
];

const INITIAL_FORM: LaunchFormState = {
  name: "",
  symbol: "",
  description: "",
  image_file: null,
  image_preview: null,
  image_cid: null,
  category: "Meme",
  initial_buy_sol: "0",
  anti_snipe: true,
  website: "",
  twitter: "",
  telegram: "",
};

export function LaunchWizard() {
  const router = useRouter();
  const { publicKey, connected, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState<LaunchFormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof LaunchFormState, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [launchedMint, setLaunchedMint] = useState<string | null>(null);
  const [launchedTx, setLaunchedTx] = useState<string | null>(null);

  const updateForm = useCallback(
    <K extends keyof LaunchFormState>(key: K, value: LaunchFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    },
    []
  );

  // ── Image dropzone ─────────────────────────────────────────

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"] },
    maxSize: LAUNCHPAD.MAX_IMAGE_SIZE_MB * 1024 * 1024,
    multiple: false,
    onDrop: useCallback(
      async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        const preview = URL.createObjectURL(file);
        updateForm("image_file", file);
        updateForm("image_preview", preview);
        updateForm("image_cid", null);

        // Upload immediately
        setUploadingImage(true);
        try {
          const { cid } = await uploadTokenImage(file);
          updateForm("image_cid", cid);
        } catch (err) {
          toast.error("Image upload failed — try again");
          updateForm("image_file", null);
          updateForm("image_preview", null);
        } finally {
          setUploadingImage(false);
        }
      },
      [updateForm]
    ),
  });

  // ── Step validation ────────────────────────────────────────

  const validateStep = useCallback(
    (s: Step): boolean => {
      const newErrors: typeof errors = {};

      if (s === "details") {
        const nameErr = validateTokenName(form.name);
        if (nameErr) newErrors.name = nameErr;
        const symErr = validateSymbol(form.symbol);
        if (symErr) newErrors.symbol = symErr;
        if (form.description.length > LAUNCHPAD.MAX_DESCRIPTION_CHARS) {
          newErrors.description = `Max ${LAUNCHPAD.MAX_DESCRIPTION_CHARS} chars`;
        }
      }

      if (s === "image") {
        if (!form.image_cid) newErrors.image_file = "Token image is required";
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [form]
  );

  const nextStep = useCallback(() => {
    const order: Step[] = ["details", "image", "socials", "review"];
    const idx = order.indexOf(step);
    if (!validateStep(step)) return;
    if (idx < order.length - 1) setStep(order[idx + 1]);
  }, [step, validateStep]);

  const prevStep = useCallback(() => {
    const order: Step[] = ["details", "image", "socials", "review"];
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
  }, [step]);

  // ── Launch ─────────────────────────────────────────────────

  const handleLaunch = useCallback(async () => {
    if (!connected || !publicKey || !signTransaction) {
      setVisible(true);
      return;
    }
    if (!form.image_cid) {
      toast.error("Please upload a token image first");
      return;
    }

    setIsSubmitting(true);
    setStep("sign");

    const toastId = toast.loading("Preparing transaction...");

    try {
      // Prepare launch (uploads metadata to IPFS, claims vanity keypair, builds tx)
      const prepared = await prepareLaunch({
        name: form.name,
        symbol: form.symbol.toUpperCase(),
        description: form.description,
        category: form.category,
        creator_wallet: publicKey.toBase58(),
        initial_buy_sol: parseFloat(form.initial_buy_sol) || 0,
        website: form.website || undefined,
        twitter: form.twitter || undefined,
        telegram: form.telegram || undefined,
        anti_snipe: form.anti_snipe,
        image_cid: form.image_cid,
        use_pumpportal: true,
      });

      toast.loading("Sign the transaction in your wallet...", { id: toastId });

      // Deserialize and sign the transaction
      const txBytes = Uint8Array.from(atob(prepared.transaction_base64), (c) =>
        c.charCodeAt(0)
      );
      const tx = VersionedTransaction.deserialize(txBytes);
      const signedTx = await signTransaction(tx as any);

      toast.loading("Broadcasting to Solana...", { id: toastId });

      // Send transaction
      const signature = await connection.sendRawTransaction(
        (signedTx as VersionedTransaction).serialize(),
        { skipPreflight: false, preflightCommitment: "confirmed" }
      );

      // Confirm transaction
      await connection.confirmTransaction(
        { signature, ...(await connection.getLatestBlockhash()) },
        "confirmed"
      );

      setLaunchedMint(prepared.mint_pubkey);
      setLaunchedTx(signature);
      setStep("success");
      toast.success(
        `${form.symbol.toUpperCase()} · FLUER launched successfully!`,
        { id: toastId, duration: 5000 }
      );
    } catch (err: any) {
      const msg = err?.message ?? "Launch failed";
      toast.error(msg.includes("rejected") ? "Transaction rejected" : `Launch failed: ${msg}`, {
        id: toastId,
      });
      setStep("review");
    } finally {
      setIsSubmitting(false);
    }
  }, [connected, publicKey, signTransaction, connection, form, setVisible]);

  // ── Step progress indicator ────────────────────────────────
  const stepOrder: Step[] = ["details", "image", "socials", "review"];
  const currentStepIdx = stepOrder.indexOf(step);

  // ── Render ─────────────────────────────────────────────────

  if (step === "sign") {
    return <SigningState />;
  }

  if (step === "success" && launchedMint) {
    return (
      <SuccessState
        mint={launchedMint}
        tx={launchedTx!}
        symbol={form.symbol.toUpperCase()}
        name={form.name}
        onViewToken={() => router.push(`/token/${launchedMint}`)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg w-full mx-auto">
      {/* ── Progress bar ──────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <div
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium",
                i <= currentStepIdx ? "text-text-primary" : "text-text-tertiary"
              )}
            >
              <div
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-2xs font-bold",
                  i < currentStepIdx
                    ? "bg-accent-primary text-white"
                    : i === currentStepIdx
                    ? "border-2 border-accent-primary text-accent-primary"
                    : "border border-border-default text-text-tertiary"
                )}
              >
                {i < currentStepIdx ? <CheckIcon size={10} /> : i + 1}
              </div>
              {s.label}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-px",
                  i < currentStepIdx ? "bg-accent-primary" : "bg-border-default"
                )}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* ── Step content ──────────────────────────────────── */}
      <div className="card animate-fade-in">
        {step === "details" && (
          <DetailsStep form={form} errors={errors} updateForm={updateForm} />
        )}
        {step === "image" && (
          <ImageStep
            form={form}
            errors={errors}
            getRootProps={getRootProps}
            getInputProps={getInputProps}
            isDragActive={isDragActive}
            uploading={uploadingImage}
            updateForm={updateForm}
          />
        )}
        {step === "socials" && (
          <SocialsStep form={form} updateForm={updateForm} />
        )}
        {step === "review" && (
          <ReviewStep form={form} connected={connected} />
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────── */}
      <div className="flex gap-3">
        {step !== "details" && (
          <button onClick={prevStep} className="btn-secondary flex-1">
            Back
          </button>
        )}

        {step !== "review" ? (
          <button onClick={nextStep} className="btn-primary flex-1">
            Continue
          </button>
        ) : (
          <>
            {connected ? (
              <button
                onClick={handleLaunch}
                disabled={isSubmitting || !form.image_cid}
                className="btn-primary flex-1"
              >
                {isSubmitting ? "Launching..." : `Launch ${form.symbol || "Token"} · FLUER`}
              </button>
            ) : (
              <button onClick={() => setVisible(true)} className="btn-primary flex-1">
                Connect Wallet to Launch
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Step sub-components ──────────────────────────────────────

function DetailsStep({
  form, errors, updateForm,
}: {
  form: LaunchFormState;
  errors: any;
  updateForm: (key: any, value: any) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Token Details</h2>
        <p className="text-sm text-text-secondary">
          All tokens launched on FLUER carry the{" "}
          <span className="text-accent-primary font-medium">· FLUER</span> suffix —
          applied automatically.
        </p>
      </div>

      {/* Name */}
      <div>
        <label className="label-xs mb-1.5 block">Token Name</label>
        <div className="flex items-center">
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateForm("name", e.target.value)}
            placeholder="My Awesome Token"
            maxLength={LAUNCHPAD.MAX_NAME_USER_CHARS}
            className={cn("input-field rounded-r-none flex-1", errors.name && "border-negative")}
          />
          <div
            className="px-3 py-2 bg-accent-muted border border-l-0 border-accent-border
                       rounded-r-md text-accent-primary text-sm font-medium whitespace-nowrap"
          >
            · FLUER
          </div>
        </div>
        {errors.name ? (
          <p className="text-negative text-xs mt-1">{errors.name}</p>
        ) : (
          <p className="text-text-tertiary text-xs mt-1">
            {form.name.length}/{LAUNCHPAD.MAX_NAME_USER_CHARS} chars
          </p>
        )}
      </div>

      {/* Symbol */}
      <div>
        <label className="label-xs mb-1.5 block">Symbol</label>
        <input
          type="text"
          value={form.symbol}
          onChange={(e) => updateForm("symbol", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          placeholder="MYTKN"
          maxLength={8}
          className={cn("input-field uppercase", errors.symbol && "border-negative")}
        />
        {errors.symbol && (
          <p className="text-negative text-xs mt-1">{errors.symbol}</p>
        )}
      </div>

      {/* Category */}
      <div>
        <label className="label-xs mb-1.5 block">Category</label>
        <select
          value={form.category}
          onChange={(e) => updateForm("category", e.target.value as TokenCategory)}
          className="input-field"
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label className="label-xs mb-1.5 block">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => updateForm("description", e.target.value)}
          placeholder="What makes this token special?"
          rows={3}
          maxLength={LAUNCHPAD.MAX_DESCRIPTION_CHARS}
          className={cn("input-field resize-none", errors.description && "border-negative")}
        />
        <p className="text-text-tertiary text-xs mt-1">
          {form.description.length}/{LAUNCHPAD.MAX_DESCRIPTION_CHARS}
        </p>
      </div>

      {/* Initial buy */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <label className="label-xs">Initial Buy (optional)</label>
          <InfoIcon size={11} className="text-text-tertiary" />
        </div>
        <div className="relative">
          <input
            type="number"
            value={form.initial_buy_sol}
            onChange={(e) => updateForm("initial_buy_sol", e.target.value)}
            placeholder="0"
            min="0"
            step="0.01"
            className="input-field pr-12"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-tertiary font-mono">
            SOL
          </span>
        </div>
        <p className="text-text-tertiary text-xs mt-1">
          Buy tokens at launch to signal conviction. Capped at {LAUNCHPAD.ANTI_SNIPE_MAX_SOL} SOL in first 30s (anti-snipe).
        </p>
      </div>
    </div>
  );
}

function ImageStep({
  form, errors, getRootProps, getInputProps, isDragActive, uploading, updateForm,
}: any) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Token Image</h2>
        <p className="text-sm text-text-secondary">
          Upload a square image (PNG, JPG, GIF, WEBP). Max {LAUNCHPAD.MAX_IMAGE_SIZE_MB}MB.
          Uploaded to IPFS via Pinata.
        </p>
      </div>

      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all text-center",
          isDragActive
            ? "border-accent-primary bg-accent-muted"
            : form.image_preview
            ? "border-positive bg-bg-positive"
            : "border-border-default hover:border-border-strong hover:bg-bg-hover"
        )}
      >
        <input {...getInputProps()} />

        {form.image_preview ? (
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <img
                src={form.image_preview}
                alt="Token"
                className="w-20 h-20 rounded-full object-cover border-2 border-border-default"
              />
              {uploading && (
                <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
              {form.image_cid && !uploading && (
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-positive rounded-full flex items-center justify-center">
                  <CheckIcon size={10} className="text-white" />
                </div>
              )}
            </div>
            <div className="text-sm text-text-secondary">
              {uploading ? "Uploading to IPFS..." : "Image ready — click to replace"}
            </div>
            {form.image_cid && (
              <div className="text-xs font-mono text-text-tertiary truncate max-w-full">
                ipfs://{form.image_cid.slice(0, 16)}...
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-text-secondary">
            <UploadIcon size={32} className="text-text-tertiary" />
            <div>
              <p className="text-sm font-medium">Drop image here or click to upload</p>
              <p className="text-xs text-text-tertiary mt-1">PNG, JPG, GIF, WEBP · max 2MB</p>
            </div>
          </div>
        )}
      </div>

      {errors.image_file && (
        <p className="text-negative text-sm">{errors.image_file}</p>
      )}
    </div>
  );
}

function SocialsStep({ form, updateForm }: any) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Social Links</h2>
        <p className="text-sm text-text-secondary">Optional — helps traders research your token.</p>
      </div>

      <div>
        <label className="label-xs mb-1.5 block">Website</label>
        <input
          type="url"
          value={form.website}
          onChange={(e) => updateForm("website", e.target.value)}
          placeholder="https://yourtoken.io"
          className="input-field"
        />
      </div>

      <div>
        <label className="label-xs mb-1.5 block">Twitter / X</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-sm">@</span>
          <input
            type="text"
            value={form.twitter}
            onChange={(e) => updateForm("twitter", e.target.value.replace("@", ""))}
            placeholder="yourhandle"
            className="input-field pl-7"
          />
        </div>
      </div>

      <div>
        <label className="label-xs mb-1.5 block">Telegram</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-sm">t.me/</span>
          <input
            type="text"
            value={form.telegram}
            onChange={(e) => updateForm("telegram", e.target.value)}
            placeholder="yourcommunity"
            className="input-field pl-14"
          />
        </div>
      </div>

      {/* Anti-snipe toggle */}
      <div
        onClick={() => updateForm("anti_snipe", !form.anti_snipe)}
        className="flex items-center justify-between p-3 rounded-lg border border-border-default
                   hover:border-border-strong cursor-pointer transition-colors"
      >
        <div>
          <p className="text-sm font-medium text-text-primary">Anti-Snipe Protection</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Limit buys to {LAUNCHPAD.ANTI_SNIPE_MAX_SOL} SOL per wallet in first 30 seconds
          </p>
        </div>
        <div
          className={cn(
            "w-9 h-5 rounded-full transition-colors relative",
            form.anti_snipe ? "bg-accent-primary" : "bg-bg-hover border border-border-default"
          )}
        >
          <div
            className={cn(
              "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
              form.anti_snipe ? "translate-x-[18px]" : "translate-x-0.5"
            )}
          />
        </div>
      </div>
    </div>
  );
}

function ReviewStep({ form, connected }: { form: LaunchFormState; connected: boolean }) {
  const fullName = ensureFluerSuffix(form.name);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text-primary">Review Launch</h2>

      {/* Token preview card */}
      <div className="flex items-center gap-3 p-3 bg-bg-raised rounded-lg border border-border-default">
        {form.image_preview && (
          <img
            src={form.image_preview}
            alt={form.symbol}
            className="w-12 h-12 rounded-full object-cover shrink-0"
          />
        )}
        <div>
          <p className="font-semibold text-text-primary">{fullName}</p>
          <p className="text-sm text-text-secondary font-mono">{form.symbol.toUpperCase()}</p>
          <span className="badge badge-accent mt-1">{form.category}</span>
        </div>
      </div>

      {/* Summary rows */}
      <div className="flex flex-col gap-2 text-sm">
        {[
          ["Total Supply", "1,000,000,000"],
          ["Bonding Curve", "80% (800M tokens)"],
          ["Graduation Target", `${LAUNCHPAD.GRADUATION_SOL_THRESHOLD} SOL`],
          ["Initial Buy", `${form.initial_buy_sol || "0"} SOL`],
          ["Platform Fee", `${LAUNCHPAD.CREATION_FEE_FLUER} FLUER`],
          ["Anti-Snipe", form.anti_snipe ? "Enabled (30s)" : "Disabled"],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between py-1.5 border-b border-border-subtle">
            <span className="text-text-secondary">{label}</span>
            <span className="text-text-primary font-mono">{value}</span>
          </div>
        ))}
      </div>

      {!connected && (
        <div className="flex items-start gap-2 p-3 bg-bg-warning rounded-md text-warning text-xs">
          <InfoIcon size={13} className="shrink-0 mt-0.5" />
          Connect your wallet before launching.
        </div>
      )}
    </div>
  );
}

function SigningState() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16 max-w-sm mx-auto text-center">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-accent-primary/20 animate-ping" />
        <div className="w-16 h-16 rounded-full border-4 border-t-accent-primary border-accent-primary/20 animate-spin" />
      </div>
      <div>
        <p className="text-text-primary font-semibold text-lg">Waiting for signature</p>
        <p className="text-text-secondary text-sm mt-1">
          Approve the transaction in your wallet to launch your token
        </p>
      </div>
    </div>
  );
}

function SuccessState({
  mint, tx, symbol, name, onViewToken,
}: {
  mint: string;
  tx: string;
  symbol: string;
  name: string;
  onViewToken: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12 max-w-sm mx-auto text-center">
      {/* Animated check */}
      <div className="w-16 h-16 rounded-full bg-bg-positive border border-positive flex items-center justify-center">
        <CheckIcon size={28} className="text-positive" />
      </div>

      <div>
        <p className="text-text-primary font-bold text-xl">
          {symbol} · FLUER Launched!
        </p>
        <p className="text-text-secondary text-sm mt-1">
          Your token is live on the FLUER bonding curve
        </p>
      </div>

      <div className="w-full flex flex-col gap-2 text-xs font-mono">
        <div className="flex justify-between p-2.5 bg-bg-raised rounded-md">
          <span className="text-text-tertiary">Mint Address</span>
          <a
            href={`${EXPLORER_URL}/token/${mint}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-primary hover:underline"
          >
            {mint.slice(0, 8)}...{mint.slice(-8)}
          </a>
        </div>
        <div className="flex justify-between p-2.5 bg-bg-raised rounded-md">
          <span className="text-text-tertiary">Transaction</span>
          <a
            href={`${EXPLORER_URL}/tx/${tx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-primary hover:underline"
          >
            {tx.slice(0, 8)}...{tx.slice(-8)}
          </a>
        </div>
      </div>

      <button onClick={onViewToken} className="btn-primary w-full">
        View Token Page
      </button>
    </div>
  );
}

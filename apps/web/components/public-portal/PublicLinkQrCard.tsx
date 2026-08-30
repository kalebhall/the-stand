'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { downloadPortalPdf, generateQrDataUrl } from '@/src/lib/qr-pdf';

interface PublicLinkQrCardProps {
  wardName: string;
  title?: string;
  url: string;
  label?: string;
  createdDateText?: string;
}

export function PublicLinkQrCard({
  wardName,
  title = 'Digital Program',
  url,
  label,
  createdDateText
}: PublicLinkQrCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    let isMounted = true;
    generateQrDataUrl(url)
      .then((dataUrl) => {
        if (isMounted) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch((err) => {
        console.error('Failed to generate QR code', err);
      });
    return () => {
      isMounted = false;
    };
  }, [url]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  async function handleDownloadPdf() {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      await downloadPortalPdf({
        wardName,
        title,
        url
      });
    } catch (err) {
      console.error('Failed to generate PDF', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/40 p-3.5">
      {label ? <p className="text-sm font-medium">{label}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">{url}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy link'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowQr((prev) => !prev)}>
            {showQr ? 'Hide QR' : 'Show QR'}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
          >
            {isGeneratingPdf ? 'Generating PDF...' : 'Download PDF Poster'}
          </Button>
        </div>
      </div>

      {createdDateText ? (
        <p className="text-xs text-muted-foreground">{createdDateText}</p>
      ) : null}

      {showQr && qrDataUrl ? (
        <div className="flex flex-col items-center justify-center rounded-md border bg-background p-4 sm:p-6">
          <div className="text-center">
            <h3 className="text-lg font-bold tracking-tight text-foreground">{wardName}</h3>
            <p className="text-sm font-semibold text-muted-foreground">{title}</p>
          </div>
          <img
            src={qrDataUrl}
            alt={`QR code for ${title}`}
            className="my-3 h-48 w-48 rounded border bg-white p-2 shadow-sm sm:h-56 sm:w-56"
          />
          <p className="text-center text-xs text-muted-foreground">
            Scan with your phone&apos;s camera to open the digital program.
          </p>
        </div>
      ) : null}
    </div>
  );
}

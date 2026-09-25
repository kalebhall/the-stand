'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { downloadPortalPdf, generateQrDataUrl } from '@/src/lib/qr-pdf';

interface PublicLinkQrCardProps {
  wardName: string;
  title?: string;
  url: string;
  label?: string;
  createdDateText?: string;
}

export function PublicLinkQrCard({ wardName, title, url, label, createdDateText }: PublicLinkQrCardProps) {
  const t = useTranslations('publicProgram');
  const displayTitle = title ?? t('digitalProgram');
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
        title: displayTitle,
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
            {copied ? t('copied') : t('copyLink')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowQr((prev) => !prev)}>
            {showQr ? t('hideQr') : t('showQr')}
          </Button>
          <Button type="button" size="sm" onClick={handleDownloadPdf} disabled={isGeneratingPdf}>
            {isGeneratingPdf ? t('generatingPdf') : t('downloadPdfPoster')}
          </Button>
        </div>
      </div>

      {createdDateText ? <p className="text-xs text-muted-foreground">{createdDateText}</p> : null}

      {showQr && qrDataUrl ? (
        <div className="flex flex-col items-center justify-center rounded-md border bg-background p-4 sm:p-6">
          <div className="text-center">
            <h3 className="text-lg font-bold tracking-tight text-foreground">{wardName}</h3>
            <p className="text-sm font-semibold text-muted-foreground">{displayTitle}</p>
          </div>
          <img
            src={qrDataUrl}
            alt={t('qrCodeFor', { title: displayTitle })}
            className="my-3 h-48 w-48 rounded border bg-white p-2 shadow-sm sm:h-56 sm:w-56"
          />
          <p className="text-center text-xs text-muted-foreground">{t('scanQrDigitalProgram')}</p>
        </div>
      ) : null}
    </div>
  );
}

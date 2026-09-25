'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { getLcrBookmarkletHref, LCR_DOM_EXTRACTOR_SCRIPT } from '@/src/imports/bookmarklet';

export function LcrExtractorInstructions({ targetType }: { targetType: 'members' | 'callings' }) {
  const t = useTranslations('imports.extractor');
  const [copiedScript, setCopiedScript] = useState(false);
  const [copyError, setCopyError] = useState(false);

  // React 19 blocks javascript: URLs set as href props. Set the attribute
  // directly on the DOM node after mount to bypass the security check while
  // still allowing the anchor to be dragged to the bookmarks bar.
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const el = bookmarkletRef.current;
    if (el) {
      el.setAttribute('href', getLcrBookmarkletHref());
    }
  }, []);

  const lcrUrl =
    targetType === 'members'
      ? 'https://lcr.churchofjesuschrist.org/mlt/records/member-list?lang=eng'
      : 'https://lcr.churchofjesuschrist.org/mlt/report/member-callings?lang=eng';

  const lcrPageName = targetType === 'members' ? 'Member List' : 'Members with Callings Report';

  function copyScript() {
    setCopyError(false);
    if (!navigator.clipboard?.writeText) {
      setCopyError(true);
      return;
    }
    navigator.clipboard
      .writeText(LCR_DOM_EXTRACTOR_SCRIPT)
      .then(() => {
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 2000);
      })
      .catch(() => {
        setCopyError(true);
      });
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span>⚡</span> {t('title')}
        </h3>
        <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">{t('recommended')}</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {t('description')}
      </p>

      <ol className="list-decimal list-inside space-y-1.5 text-xs text-foreground/90">
        <li>
          {t('step1')}
          <span className="ml-2 inline-block">
            {/* href is set imperatively via ref — React 19 blocks javascript: URLs as props */}
            <a
              ref={bookmarkletRef}
              className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90 cursor-grab"
              onClick={(e) => {
                e.preventDefault();
                alert(t('dragAlert'));
              }}
            >
              {t('bookmarklet')}
            </a>
          </span>
        </li>
        <li>
          {t('open')}{' '}
          <a
            href={lcrUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
          >
            LCR {lcrPageName} ↗
          </a>{' '}
          {t('andLogin')}
        </li>
        <li>
          {t('step3')}
        </li>
        <li>
          {t('step4')}
        </li>
      </ol>

      <div className="pt-1 flex items-center gap-2 flex-wrap">
        <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={copyScript}>
          {copiedScript ? t('copied') : t('copy')}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          ({t('blocked')})
        </span>
        {copyError && (
          <span className="text-[11px] text-destructive">{t('clipboardError')}</span>
        )}
      </div>
    </div>
  );
}

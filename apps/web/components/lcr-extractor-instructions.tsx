'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getLcrBookmarkletHref, LCR_DOM_EXTRACTOR_SCRIPT } from '@/src/imports/bookmarklet';

export function LcrExtractorInstructions({
  targetType
}: {
  targetType: 'members' | 'callings';
}) {
  const [copiedScript, setCopiedScript] = useState(false);
  const bookmarkletHref = getLcrBookmarkletHref();

  const lcrUrl =
    targetType === 'members'
      ? 'https://lcr.churchofjesuschrist.org/records/member-list?lang=eng'
      : 'https://lcr.churchofjesuschrist.org/mlt/report/member-callings?lang=eng';

  const lcrPageName = targetType === 'members' ? 'Member List' : 'Members with Callings Report';

  function copyScript() {
    void navigator.clipboard.writeText(LCR_DOM_EXTRACTOR_SCRIPT).then(() => {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    });
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span>⚡</span> Browser DOM Extractor (Zero Password Sharing)
        </h3>
        <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">
          Recommended
        </span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Extract data directly from your authenticated Church session without sharing credentials or triggering security lockouts.
      </p>

      <ol className="list-decimal list-inside space-y-1.5 text-xs text-foreground/90">
        <li>
          Drag this bookmarklet to your browser bookmarks bar:
          <span className="ml-2 inline-block">
            <a
              href={bookmarkletHref}
              className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90 cursor-grab"
              onClick={(e) => {
                // Prevent navigating if clicked directly
                if (!e.defaultPrevented) {
                  e.preventDefault();
                  alert('Drag this button to your browser bookmarks bar! Then open LCR and click it in your bookmarks.');
                }
              }}
            >
              ⭐ The Stand: Extract LCR
            </a>
          </span>
        </li>
        <li>
          Open{' '}
          <a
            href={lcrUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
          >
            LCR {lcrPageName} ↗
          </a>{' '}
          and log in with your Church Account.
        </li>
        <li>Click the <strong>The Stand: Extract LCR</strong> bookmark in your bookmarks bar.</li>
        <li>Return here, click <strong>Paste text</strong>, and paste the clipboard contents into the box.</li>
      </ol>

      <div className="pt-1 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs h-7"
          onClick={copyScript}
        >
          {copiedScript ? 'Copied Console Code!' : 'Copy Console Snippet (Alternative)'}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          (If bookmarklets are blocked in your browser, paste this into DevTools Console)
        </span>
      </div>
    </div>
  );
}

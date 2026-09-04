/**
 * Helper generating bookmarklet code that can be dragged to browser bookmarks bar
 * or copied to execute on LCR (lcr.churchofjesuschrist.org) in the user's active session.
 *
 * The extraction script handles two LCR table formats:
 *  - Eden table format (current): each <td> contains a cloned column-header <span> + the value
 *  - Legacy ARIA grid format: [role="grid"] / [role="table"]
 */

export const LCR_DOM_EXTRACTOR_SCRIPT = `(function() {
  function normalize(val) {
    return (val || '').replace(/\\s+/g, ' ').trim();
  }

  // Eden table format used by current LCR pages.
  // Each <td> has a <span class="eden-table-card-view__cloned-column-header"> label
  // followed by the actual cell value. Checkbox/action cells have no label span.
  //
  // Special case: the "Set Apart" column uses an SVG checkmark icon — its textContent
  // is always empty regardless of set-apart status. We detect the SVG explicitly and
  // emit "yes" or "no" so the server-side parser can read it correctly.
  function extractEdenTable() {
    var table = document.querySelector('table');
    if (!table) return null;

    var headers = [];
    var thead = table.querySelector('thead');
    if (thead) {
      Array.from(thead.querySelectorAll('th')).forEach(function(th) {
        var labelSpan = th.querySelector('.eden-table-card-view__cloned-column-header');
        var label = labelSpan ? normalize(labelSpan.textContent) : normalize(th.textContent);
        if (label) headers.push(label);
      });
    }

    // Find which column index (0-based within data columns) is "Set Apart"
    var setApartIdx = headers.findIndex(function(h) { return /set apart/i.test(h); });

    var dataRows = Array.from(table.querySelectorAll('tbody tr')).map(function(r) {
      var colIdx = 0;
      return Array.from(r.querySelectorAll('td')).reduce(function(acc, td) {
        var labelSpan = td.querySelector('.eden-table-card-view__cloned-column-header');
        if (!labelSpan) return acc; // skip checkbox / action cells
        if (colIdx === setApartIdx) {
          // Checkmark icon = set apart. Info icon (not managed by unit) is also set apart.
          // Absence of any SVG = not set apart.
          var svgEl = td.querySelector('svg.eden-icon');
          acc.push(svgEl ? 'yes' : 'no');
        } else {
          var clone = td.cloneNode(true);
          var spanEl = clone.querySelector('.eden-table-card-view__cloned-column-header');
          if (spanEl && spanEl.parentNode) spanEl.parentNode.removeChild(spanEl);
          acc.push(normalize(clone.textContent));
        }
        colIdx++;
        return acc;
      }, []);
    }).filter(function(r) { return r.length > 0; });

    if (dataRows.length > 0) {
      return { headers: headers, rows: dataRows };
    }
    return null;
  }

  // Fallback: legacy plain <table> without Eden label spans.
  function extractPlainTable() {
    var htmlTable = document.querySelector('table');
    if (!htmlTable) return null;
    var ths = Array.from(htmlTable.querySelectorAll('thead th, tr:first-child th'));
    var rows = Array.from(htmlTable.querySelectorAll('tbody tr'));
    var headers = ths.map(function(th) { return normalize(th.textContent); });
    var dataRows = rows.map(function(r) {
      return Array.from(r.querySelectorAll('td')).map(function(td) { return normalize(td.textContent); });
    }).filter(function(r) { return r.length > 0; });
    if (dataRows.length > 0) {
      return { headers: headers, rows: dataRows };
    }
    return null;
  }

  // Fallback: ARIA grid format.
  function extractAriaGrid() {
    var grid = document.querySelector('[role="grid"]') || document.querySelector('[role="table"]');
    if (!grid) return null;
    var headerCells = Array.from(grid.querySelectorAll('[role="columnheader"]'));
    var headers = headerCells.map(function(cell) { return normalize(cell.textContent); });
    var rowEls = Array.from(grid.querySelectorAll('[role="row"]')).filter(function(r) {
      return r.querySelector('[role="gridcell"], [role="cell"]');
    });
    var rows = rowEls.map(function(r) {
      return Array.from(r.querySelectorAll('[role="gridcell"], [role="cell"]')).map(function(c) {
        return normalize(c.textContent);
      });
    });
    if (rows.length > 0) {
      return { headers: headers, rows: rows };
    }
    return null;
  }

  var extracted = extractEdenTable() || extractPlainTable() || extractAriaGrid();
  if (!extracted || !extracted.rows.length) {
    alert('The Stand: Could not find any member or calling table data on this page.');
    return;
  }

  var tsv = '';
  if (extracted.headers.length) {
    tsv += extracted.headers.join('\\t') + '\\n';
  }
  extracted.rows.forEach(function(row) {
    tsv += row.join('\\t') + '\\n';
  });

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(tsv).then(function() {
      alert('The Stand: Copied ' + extracted.rows.length + ' rows to clipboard! Switch to The Stand and click "Paste Text" then "Commit Import".');
    }).catch(function() {
      prompt('The Stand: Copy this extracted table data (Ctrl+C / Cmd+C):', tsv);
    });
  } else {
    prompt('The Stand: Copy this extracted table data (Ctrl+C / Cmd+C):', tsv);
  }
})();`;

export function getLcrBookmarkletHref(): string {
  return `javascript:${encodeURIComponent(LCR_DOM_EXTRACTOR_SCRIPT)}`;
}

/**
 * Helper generating bookmarklet code that can be dragged to browser bookmarks bar
 * or copied to execute on LCR (lcr.churchofjesuschrist.org) in the user's active session.
 */

export const LCR_DOM_EXTRACTOR_SCRIPT = `(function() {
  function normalize(val) {
    return (val || '').replace(/\\s+/g, ' ').trim();
  }

  function extractTable() {
    var htmlTable = document.querySelector('table');
    if (htmlTable) {
      var ths = Array.from(htmlTable.querySelectorAll('thead th, tr:first-child th'));
      var rows = Array.from(htmlTable.querySelectorAll('tbody tr'));
      var headers = ths.map(function(th) { return normalize(th.textContent); });
      var dataRows = rows.map(function(r) {
        return Array.from(r.querySelectorAll('td')).map(function(td) { return normalize(td.textContent); });
      }).filter(function(r) { return r.length > 0; });
      if (dataRows.length > 0) {
        return { headers: headers, rows: dataRows };
      }
    }

    var grid = document.querySelector('[role="grid"]') || document.querySelector('[role="table"]');
    if (grid) {
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
    }

    return null;
  }

  var extracted = extractTable();
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
    }).catch(function(err) {
      prompt('The Stand: Copy this extracted table data (Ctrl+C / Cmd+C):', tsv);
    });
  } else {
    prompt('The Stand: Copy this extracted table data (Ctrl+C / Cmd+C):', tsv);
  }
})();`;

export function getLcrBookmarkletHref(): string {
  return `javascript:${encodeURIComponent(LCR_DOM_EXTRACTOR_SCRIPT)}`;
}

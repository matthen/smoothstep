// Search across the docs' sections, in the browser.
import type { DocPage } from '../docs/render';

export interface SearchResult {
  page: DocPage;
  anchor: string;
  heading: string;
  // The section's text around the first word's first match.
  before: string;
  match: string;
  after: string;
}

// Sections holding every word of the query, best first: those with the words in their heading,
// then those that use them most.
export function searchDocs(pages: readonly DocPage[], query: string, limit = 30): SearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }
  const found: (SearchResult & {score: number})[] = [];
  for (const page of pages) {
    const title = page.title.toLowerCase();
    for (const section of page.sections) {
      const heading = section.heading.toLowerCase();
      const text = section.text.toLowerCase();
      if (!terms.every(term => text.includes(term) || heading.includes(term) || title.includes(term))) {
        continue;
      }
      // Up to 5 points for a word the text uses often, as a section about it does.
      const score = terms.reduce((sum, term) => sum + (heading.includes(term) ? 6 : 0) +
        (title.includes(term) ? 2 : 0) + Math.min(5, text.split(term).length - 1), 0);
      const at = text.indexOf(terms[0]!);
      const start = Math.max(0, at - 50);
      const end = at < 0 ? 0 : at + terms[0]!.length;
      found.push({
        page, anchor: section.id, heading: section.heading, score,
        before: at < 0 ? section.text.slice(0, 110) : (start > 0 ? "…" : "") + section.text.slice(start, at),
        match: at < 0 ? "" : section.text.slice(at, end),
        after: at < 0 ? "" : section.text.slice(end, end + 70) + (end + 70 < section.text.length ? "…" : ""),
      });
    }
  }
  return found.sort((a, b) => b.score - a.score).slice(0, limit);
}

// The classes JavaScript is coloured with, in the Canvas2D tab, the docs and the tutorial, styled as
// for the shader language, with property names set apart.
import { tagHighlighter, tags as t } from '@lezer/highlight';

export const jsHighlighter = tagHighlighter([
  { tag: [t.keyword, t.self], class: 'tok-keyword' },
  { tag: t.typeName, class: 'tok-type' },
  { tag: t.propertyName, class: 'tok-property' },
  { tag: t.variableName, class: 'tok-variable' },
  { tag: [t.atom, t.bool, t.null], class: 'tok-atom' },
  { tag: t.number, class: 'tok-number' },
  { tag: t.comment, class: 'tok-comment' },
  { tag: [t.string, t.regexp], class: 'tok-string' },
  { tag: t.operator, class: 'tok-operator' },
]);

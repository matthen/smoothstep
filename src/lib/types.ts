// A shader compile error on one line of the user's code (0-based line number).
export interface LineError {
  line: number;
  message: string;
  // Set when the code lacks the function every tab needs, so the editor can offer to add one.
  missing?: "draw" | "mainImage";
}

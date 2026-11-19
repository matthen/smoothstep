// A shader compile error on one line of the user's code (0-based line number).
export interface LineError {
  line: number;
  message: string;
}

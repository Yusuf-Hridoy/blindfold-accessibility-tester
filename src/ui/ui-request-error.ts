// A request the web UI refuses, with the HTTP status and (for form input) the
// field the message belongs next to.

export class UiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

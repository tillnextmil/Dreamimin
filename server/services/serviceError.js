/* ============================================================
   ServiceError: a request the service can't carry out, with the
   HTTP status and JSON body the API contract gives for it
   (SPECIFICATIONS.md, item 12). Services throw it; routes turn
   it into the response, so routes need no rules of their own.
   ============================================================ */

class ServiceError extends Error {
  /* body is { errors: { field: message } } for a 400, or { error: message } otherwise */
  constructor(status, body) {
    super(body.error || Object.values(body.errors || {})[0] || `The request failed (${status}).`);
    this.name = "ServiceError";
    this.status = status;
    this.body = body;
  }

  /* 400: one message per invalid field */
  static invalid(errors) {
    return new ServiceError(400, { errors });
  }

  /* 404: no item with that id */
  static notFound(message) {
    return new ServiceError(404, { error: message });
  }

  /* 409: valid input that doesn't fit what's saved */
  static conflict(message) {
    return new ServiceError(409, { error: message });
  }
}

module.exports = ServiceError;
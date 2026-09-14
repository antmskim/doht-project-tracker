// Express 4 doesn't catch rejected promises from async route handlers —
// an unhandled rejection would just hang the request (or crash the process
// on some platforms). Wrapping every handler in this forwards the error to
// Express's error-handling middleware instead.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };

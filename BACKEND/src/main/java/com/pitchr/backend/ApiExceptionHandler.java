package com.pitchr.backend;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;

/** Converts API exceptions into the stable JSON envelope used by the frontend. */
@RestControllerAdvice
public class ApiExceptionHandler {
    /** Preserve explicit HTTP status and reason text from service/controller validation. */
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ApiError> status(ResponseStatusException ex, HttpServletRequest request) {
        return error(ex.getStatusCode(), ex.getReason(), request);
    }

    /** Return the first concrete field error instead of the old hardcoded swipe-action message. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> invalid(MethodArgumentNotValidException ex, HttpServletRequest request) {
        String message = ex.getBindingResult().getFieldErrors().stream()
            .map(field -> field.getField() + " " + field.getDefaultMessage()).findFirst()
            .orElse("Request validation failed");
        return error(HttpStatus.BAD_REQUEST, message, request);
    }

    /** Malformed JSON receives a useful request-level error while retaining the four-field envelope. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> unreadable(HttpMessageNotReadableException ex, HttpServletRequest request) {
        // Jackson reports an invalid Swipe.Action during deserialization, before Bean Validation can run.
        String cause = ex.getMostSpecificCause() == null ? "" : String.valueOf(ex.getMostSpecificCause().getMessage());
        if (request.getRequestURI().contains("/me/swipes/") && cause.contains("Swipe$Action")) {
            return error(HttpStatus.BAD_REQUEST, "action must be pass, like, or super_like", request);
        }
        return error(HttpStatus.BAD_REQUEST, "Request body is missing or malformed", request);
    }

    /** Multipart parser failures that are not size overflow still get a clear client error. */
    @ExceptionHandler(MultipartException.class)
    ResponseEntity<ApiError> multipart(MultipartException ex, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "Multipart request is invalid or missing the files field", request);
    }

    /** Framework-level multipart limits are reported as 413 rather than an opaque server error. */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ApiError> uploadTooLarge(MaxUploadSizeExceededException ex, HttpServletRequest request) {
        return error(HttpStatus.PAYLOAD_TOO_LARGE, "Each image must be 5 MB or smaller", request);
    }

    /** All error paths share the existing timestamp/status/message/path JSON response shape. */
    private ResponseEntity<ApiError> error(HttpStatusCode status, String message, HttpServletRequest request) {
        return ResponseEntity.status(status).body(new ApiError(Instant.now(), status.value(),
            message == null || message.isBlank() ? "Request failed" : message, request.getRequestURI()));
    }

    record ApiError(Instant timestamp, int status, String message, String path) {}
}

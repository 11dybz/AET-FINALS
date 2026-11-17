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

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> malformedJson(HttpMessageNotReadableException ex, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "malformed JSON request body", request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> invalid(MethodArgumentNotValidException ex, HttpServletRequest request) {
        if (ex instanceof MethodArgumentNotValidException notValid) {
            var fieldError = notValid.getBindingResult().getFieldError("body");
            if (fieldError != null) return error(HttpStatus.BAD_REQUEST, "body must be 1-1000 characters", request);
        }
        return error(HttpStatus.BAD_REQUEST, "action must be pass, like, or super_like", request);
    }

    private ResponseEntity<ApiError> error(HttpStatusCode status, String message, HttpServletRequest request) {
        return ResponseEntity.status(status).body(new ApiError(Instant.now(), status.value(),
            message == null || message.isBlank() ? "Request failed" : message, request.getRequestURI()));
    }

    public record ApiError(Instant timestamp, int status, String message, String path) {}
}

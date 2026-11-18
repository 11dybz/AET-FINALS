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
import org.springframework.web.ErrorResponse;

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

    @ExceptionHandler(org.springframework.beans.TypeMismatchException.class)
    ResponseEntity<ApiError> typeMismatch(org.springframework.beans.TypeMismatchException ex, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "Invalid request parameter", request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> invalid(MethodArgumentNotValidException ex, HttpServletRequest request) {
        var fieldError = ex.getBindingResult().getFieldError();
        String message = fieldError == null ? "Invalid request" :
            fieldError.getField() + " " + fieldError.getDefaultMessage();
        return error(HttpStatus.BAD_REQUEST, message, request);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ApiError> tooLarge(MaxUploadSizeExceededException ex, HttpServletRequest request) {
        return error(HttpStatus.PAYLOAD_TOO_LARGE, "Each image must be 5 MB or smaller; total upload limit is 42 MB", request);
    }

    @ExceptionHandler(MultipartException.class)
    ResponseEntity<ApiError> multipart(MultipartException ex, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "Invalid multipart upload", request);
    }

    @ExceptionHandler(jakarta.validation.ConstraintViolationException.class)
    ResponseEntity<ApiError> constraint(jakarta.validation.ConstraintViolationException ex, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "Invalid request parameter", request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> framework(Exception ex, HttpServletRequest request) throws Exception {
        if (ex instanceof ErrorResponse response) {
            return error(response.getStatusCode(), response.getBody().getDetail(), request);
        }
        // Let Spring log unexpected server errors without exposing implementation details.
        throw ex;
    }

    private ResponseEntity<ApiError> error(HttpStatusCode status, String message, HttpServletRequest request) {
        return ResponseEntity.status(status).body(new ApiError(Instant.now(), status.value(),
            message == null || message.isBlank() ? "Request failed" : message, request.getRequestURI()));
    }

    public record ApiError(Instant timestamp, int status, String message, String path) {}
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AuthenticationRequiredError extends DomainError {
  constructor(message = "Authentication required.") {
    super(message);
  }
}

export class AccessDeniedError extends DomainError {
  constructor(message = "Access denied.") {
    super(message);
  }
}

export class ValidationError extends DomainError {
  public fieldErrors?: Record<string, string[]>;
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

export class RecordNotFoundError extends DomainError {
  constructor(message = "Record not found.") {
    super(message);
  }
}

export class InsufficientFundsError extends DomainError {
  constructor(message = "Insufficient funds in Cash on Hand / Cash in Bank account.") {
    super(message);
  }
}

export class ConcurrentModificationError extends DomainError {
  constructor(message = "This record was modified by another user. Reload and review the latest version.") {
    super(message);
  }
}

export class IdempotencyConflictError extends DomainError {
  constructor(message = "Command failed: Idempotency key reused with a different payload.") {
    super(message);
  }
}

export class IdempotencyInProgressError extends DomainError {
  constructor(message = "Command is already in progress. Retry after it completes.") {
    super(message);
  }
}

export class StorageConsistencyError extends DomainError {
  constructor(message = "Attachment file missing or size mismatch on disk.") {
    super(message);
  }
}

export class TransientDatabaseConflictError extends DomainError {
  constructor(message = "Transient database conflict. Please retry the operation.") {
    super(message);
  }
}

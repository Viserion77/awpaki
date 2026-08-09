// `aws-lambda` is an optional peer dependency and this import is types only:
// `import type` guarantees it is erased at compile time, so the emitted JavaScript
// never requires the package — even under `isolatedModules`/`verbatimModuleSyntax`
// or with a bundler that does not elide unused value imports.
import type { APIGatewayProxyResult, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

/**
 * Base class for HTTP errors with AWS Lambda integration
 *
 * @example
 * ```typescript
 * throw new HttpError('Something went wrong', 500);
 * ```
 */
export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly data?: Record<string, any>;
  public readonly headers?: Record<string, string | boolean | number>;
  // Definite assignment: the constructor installs this through `Object.defineProperty`
  // (see below), which TypeScript cannot see as an initialization.
  private readonly lambdaMetadata!: {
    logStreamName?: string;
    executionEnv?: string;
    functionName?: string;
  };

  constructor(
    message: string,
    statusCode: number,
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.data = data;
    this.headers = headers;

    // Capture Lambda environment metadata.
    // `private` is erased at runtime, so a plain assignment leaves an own *enumerable*
    // property that every structured serializer picks up — the error loggers would copy
    // this whole object into each log line, on top of the `$x-custom-metadata` block the
    // response body already carries. Defined non-enumerable so it stays an implementation
    // detail; reads through `this.lambdaMetadata` are unaffected.
    Object.defineProperty(this, 'lambdaMetadata', {
      value: {
        logStreamName: process.env.AWS_LAMBDA_LOG_STREAM_NAME,
        executionEnv: process.env.AWS_EXECUTION_ENV,
        functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      },
      enumerable: false,
      writable: false,
      configurable: true,
    });

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns a string representation of the error for logging
   * @returns {string}
   */
  public toString(): string {
    return `${this.name}: ${this.message}${this.stack ? `\n${this.stack}` : ''}`;
  }

  /**
   * Returns an AWS API Gateway response object
   * Useful for returning errors in API Gateway Lambda functions
   *
   * @example
   * ```typescript
   * try {
   *   // your code
   * } catch (error) {
   *   if (error instanceof HttpError) {
   *     return error.toApiGatewayResponse();
   *   }
   *   throw error;
   * }
   * ```
   */
  public toApiGatewayResponse(
    additionalHeaders?: Record<string, string | boolean | number>
  ): APIGatewayProxyResult {
    const responseBody: any = { message: this.message };

    if (this.data) {
      responseBody.data = this.data;
    }

    // Include Lambda metadata if available
    if (
      this.lambdaMetadata.logStreamName ||
      this.lambdaMetadata.executionEnv ||
      this.lambdaMetadata.functionName
    ) {
      responseBody['$x-custom-metadata'] = {
        ...(this.lambdaMetadata.logStreamName && {
          logStreamName: this.lambdaMetadata.logStreamName,
        }),
        ...(this.lambdaMetadata.executionEnv && { executionEnv: this.lambdaMetadata.executionEnv }),
        ...(this.lambdaMetadata.functionName && { functionName: this.lambdaMetadata.functionName }),
      };
    }

    return {
      statusCode: this.statusCode,
      body: JSON.stringify(responseBody),
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
        ...additionalHeaders,
      },
    };
  }

  /**
   * Returns an AWS API Gateway V2 (HTTP API) response object
   * Useful for returning errors in API Gateway V2 Lambda functions with Payload Format 2.0
   * Supports cookies in addition to standard headers
   *
   * @param additionalHeaders - Optional additional headers to include
   * @param cookies - Optional cookies to set
   * @returns API Gateway V2 response format
   *
   * @example
   * ```typescript
   * try {
   *   // your code
   * } catch (error) {
   *   if (error instanceof HttpError) {
   *     return error.toApiGatewayResponseV2(undefined, ['session=; Max-Age=0']);
   *   }
   *   throw error;
   * }
   * ```
   */
  public toApiGatewayResponseV2(
    additionalHeaders?: Record<string, string | boolean | number>,
    cookies?: string[]
  ): APIGatewayProxyStructuredResultV2 {
    const responseBody: any = { message: this.message };

    if (this.data) {
      responseBody.data = this.data;
    }

    // Include Lambda metadata if available
    if (
      this.lambdaMetadata.logStreamName ||
      this.lambdaMetadata.executionEnv ||
      this.lambdaMetadata.functionName
    ) {
      responseBody['$x-custom-metadata'] = {
        ...(this.lambdaMetadata.logStreamName && {
          logStreamName: this.lambdaMetadata.logStreamName,
        }),
        ...(this.lambdaMetadata.executionEnv && { executionEnv: this.lambdaMetadata.executionEnv }),
        ...(this.lambdaMetadata.functionName && { functionName: this.lambdaMetadata.functionName }),
      };
    }

    return {
      statusCode: this.statusCode,
      body: JSON.stringify(responseBody),
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
        ...additionalHeaders,
      },
      ...(cookies && cookies.length > 0 && { cookies }),
    };
  }

  /**
   * Returns a structured error response for non-HTTP Lambda triggers
   * Used for SQS, SNS, EventBridge, S3, and DynamoDB Stream triggers
   *
   * @example
   * ```typescript
   * try {
   *   // your code
   * } catch (error) {
   *   if (error instanceof HttpError) {
   *     return error.toGenericResponse();
   *   }
   *   throw error;
   * }
   * ```
   */
  public toGenericResponse(): {
    error: string;
    message: string;
    statusCode: number;
    data?: Record<string, any>;
  } {
    return {
      error: this.constructor.name,
      message: this.message,
      statusCode: this.statusCode,
      data: this.data,
    };
  }
}

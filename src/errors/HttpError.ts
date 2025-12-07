import { APIGatewayProxyResult } from 'aws-lambda';

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
   * Returns an AWS Lambda proxy response object
   * Useful for returning errors in Lambda functions after instanceof check
   * 
   * @example
   * ```typescript
   * try {
   *   // your code
   * } catch (error) {
   *   if (error instanceof HttpError) {
   *     return error.toLambdaResponse();
   *   }
   *   throw error;
   * }
   * ```
   */
  public toLambdaResponse(additionalHeaders?: Record<string, string | boolean | number>): APIGatewayProxyResult {
    const responseBody: any = { message: this.message };
    
    if (this.data) {
      responseBody.data = this.data;
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
}

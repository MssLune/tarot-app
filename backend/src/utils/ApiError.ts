/** Error de dominio con código HTTP y código de negocio, listo para la respuesta JSON. */
export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }

  static notFound(code: string, message: string): ApiError {
    return new ApiError(404, code, message);
  }

  static badRequest(code: string, message: string): ApiError {
    return new ApiError(400, code, message);
  }
}

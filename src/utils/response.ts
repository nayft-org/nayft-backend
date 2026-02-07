import { Response } from 'express';
import { ApiResponse } from '../types';

export const sendSuccess = <T>(res: Response, data: T, statusCode: number = 200): void => {
  const response: ApiResponse<T> = {
    success: true,
    data,
    error: null,
  };
  res.status(statusCode).json(response);
};

export const sendError = (res: Response, error: string, statusCode: number = 400): void => {
  const response: ApiResponse = {
    success: false,
    data: undefined,
    error,
  };
  res.status(statusCode).json(response);
};


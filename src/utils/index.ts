import { Response } from 'express';

// Unauthorized response helper
export const unauthorized = (res: Response, message: string = 'Unauthorized access') => {
  res.status(401).json({
    success: false,
    message: message,
    error: 'UNAUTHORIZED'
  });
};

// Forbidden response helper
export const forbidden = (res: Response, message: string = 'Forbidden access') => {
  res.status(403).json({
    success: false,
    message: message,
    error: 'FORBIDDEN'
  });
};

// Bad request response helper
export const badRequest = (res: Response, message: string = 'Bad request') => {
  res.status(400).json({
    success: false,
    message: message,
    error: 'BAD_REQUEST'
  });
};

// Not found response helper
export const notFound = (res: Response, message: string = 'Resource not found') => {
  res.status(404).json({
    success: false,
    message: message,
    error: 'NOT_FOUND'
  });
};

// Internal server error response helper
export const internalError = (res: Response, message: string = 'Internal server error') => {
  res.status(500).json({
    success: false,
    message: message,
    error: 'INTERNAL_ERROR'
  });
};

// Success response helper
export const success = (res: Response, data: any = null, message: string = 'Success') => {
  res.status(200).json({
    success: true,
    message: message,
    data: data
  });
};

// Created response helper
export const created = (res: Response, data: any = null, message: string = 'Created successfully') => {
  res.status(201).json({
    success: true,
    message: message,
    data: data
  });
};

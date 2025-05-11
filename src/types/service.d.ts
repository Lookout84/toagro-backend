// src/types/service.d.ts

declare namespace ToAgro {
  interface ServiceResult<T> {
    success: boolean;
    data?: T;
    error?: {
      message: string;
      code?: string;
      details?: any;
    };
  }
  
  interface PaginatedResult<T> {
    items: T[];
    meta: {
      total: number;
      page: number;
      limit: number;
      pages: number;
    };
  }
  
  interface ApiResponse<T> {
    status: 'success' | 'error';
    message?: string;
    data?: T;
    meta?: any;
    errors?: any[];
  }
}
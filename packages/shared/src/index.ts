export interface ApiSuccessResponse<T> {
  data: T;
}

export interface ApiPaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export function apiData<T>(data: T): ApiSuccessResponse<T> {
  return { data };
}

export function apiPaginated<T>(
  data: T[],
  meta: { page: number; pageSize: number; total: number },
): ApiPaginatedResponse<T> {
  return { data, meta };
}

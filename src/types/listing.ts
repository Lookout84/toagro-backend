import { Listing, MotorizedSpec, Prisma } from '@prisma/client';

export interface ListingResult {
  listing: Listing;
}

export interface CreateListingData {
  title: string;
  description: string;
  price: number | string;
  currency: string;
  location?: LocationInput;
  category?: string;
  categoryId: number;
  brandId?: number;
  images: string[];
  condition: string;
  userId: number;
  priceType?: string;
  vatIncluded?: boolean;
  phone?: string;
  telegram?: string;
  viber?: string;
  whatsapp?: string;
  motorizedSpec?: any;
}

export interface UpdateListingData {
  title?: string;
  description?: string;
  price?: number | string;
  currency?: string;
  location?: LocationInput;
  category?: string;
  categoryId?: number;
  brandId?: number | null;
  images?: string[];
  condition?: string;
  active?: boolean;
  priceType?: string;
  vatIncluded?: boolean;
  phone?: string;
  telegram?: string;
  viber?: string;
  whatsapp?: string;
  motorizedSpec?: any;
}

export interface LocationInput {
  countryId?: number;
  settlement: string;
  region?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  osmId?: number;
  osmType?: string;
  placeId?: number;
  displayName?: string;
  addressType?: string;
  boundingBox?: string[];
  osmJsonData?: any;
}

export interface ListingQueryFilters {
  search?: string;
  category?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  countryId?: number;
  regionId?: number | string;
  communityId?: number | string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  userId?: number;
  currency?: string;
  active?: boolean;
  location?: LocationInput;
}

export interface ListingWithDetails extends Listing {
  favoriteCount: number;
  similarListings: Array<Listing & { favoriteCount: number }>;
}

export interface ListingPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListingsResult {
  listings: Array<Listing & { favoriteCount: number }>;
  pagination: ListingPagination;
}
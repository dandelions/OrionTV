import AsyncStorage from "@react-native-async-storage/async-storage";

// region: --- Interface Definitions ---
export interface DoubanItem {
  title: string;
  poster: string;
  rate?: string;
  year?: string;
}

export interface DoubanResponse {
  code: number;
  message: string;
  list: DoubanItem[];
}

export interface CategoryTagConfig {
  name: string;
  api: "categories" | "recommends" | "list" | "bangumi";
  kind?: "movie" | "tv";
  category?: string;
  type?: string;
  format?: string;
  query?: string;
}

export interface CategoryConfig {
  id: string;
  name: string;
  tags: CategoryTagConfig[];
}

export interface BangumiCalendarDay {
  weekday: {
    en: string;
    cn?: string;
  };
  items: {
    id: number;
    name: string;
    name_cn?: string;
    rating?: { score: number };
    air_date?: string;
    images?: {
      large?: string;
      common?: string;
      medium?: string;
      small?: string;
      grid?: string;
    };
  }[];
}

// 豆瓣接口在部分服务器上会被封禁（服务端直连返回 500），此时改用客户端直连 CDN 镜像
const DOUBAN_MIRRORS = [
  "https://m.douban.cmliussss.net",
  "https://m.douban.cmliussss.com",
  "https://m.douban.com",
];

const DOUBAN_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Referer: "https://movie.douban.com/",
  Accept: "application/json, text/plain, */*",
};

const fetchJsonWithTimeout = async (
  url: string,
  headers?: Record<string, string>
): Promise<any> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchDoubanFromMirrors = async (path: string): Promise<any> => {
  let lastError: unknown;
  for (const mirror of DOUBAN_MIRRORS) {
    try {
      return await fetchJsonWithTimeout(`${mirror}${path}`, DOUBAN_HEADERS);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("豆瓣请求失败");
};

export interface VideoDetail {
  id: string;
  title: string;
  poster: string;
  source: string;
  source_name: string;
  desc?: string;
  type?: string;
  year?: string;
  area?: string;
  director?: string;
  actor?: string;
  remarks?: string;
}

export interface SearchResult {
  id: number;
  title: string;
  poster: string;
  episodes: string[];
  source: string;
  source_name: string;
  class?: string;
  year: string;
  desc?: string;
  type_name?: string;
}

export interface Favorite {
  cover: string;
  title: string;
  source_name: string;
  total_episodes: number;
  search_title: string;
  year: string;
  save_time?: number;
}

export interface PlayRecord {
  title: string;
  source_name: string;
  cover: string;
  search_title: string;
  index: number;
  total_episodes: number;
  play_time: number;
  total_time: number;
  save_time: number;
  year: string;
}

export interface ApiSite {
  key: string;
  api: string;
  name: string;
  detail?: string;
}

export interface ServerConfig {
  SiteName: string;
  StorageType: "localstorage" | "redis" | string;
  LoginRequireTurnstile?: boolean;
  TurnstileSiteKey?: string;
}

export class API {
  public baseURL: string = "";

  constructor(baseURL?: string) {
    if (baseURL) {
      this.baseURL = baseURL;
    }
  }

  public setBaseUrl(url: string) {
    this.baseURL = url;
  }

  private normalizeCookieHeader(cookie: string): string {
    const authMatch = cookie.match(/(?:^|,\s*)auth=([^;,\s]+)/);
    if (authMatch?.[1]) {
      return `auth=${authMatch[1]}`;
    }

    if (cookie.includes("=")) {
      return cookie.split(";")[0];
    }

    return `auth=${cookie}`;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "User-Agent": "OrionTV",
    };
    const authCookies = await AsyncStorage.getItem("authCookies");
    const authToken = await AsyncStorage.getItem("authToken");

    if (authCookies) {
      headers.Cookie = this.normalizeCookieHeader(authCookies);
    }

    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    return headers;
  }

  private mergeHeaders(
    authHeaders: Record<string, string>,
    requestHeaders?: HeadersInit
  ): HeadersInit {
    return {
      ...authHeaders,
      ...(requestHeaders || {}),
    };
  }

  private async _fetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.baseURL) {
      throw new Error("API_URL_NOT_SET");
    }

    const authHeaders = await this.getAuthHeaders();
    const response = await fetch(`${this.baseURL}${url}`, {
      ...options,
      headers: this.mergeHeaders(authHeaders, options.headers),
    });

    if (response.status === 401) {
      throw new Error("UNAUTHORIZED");
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  }

  async login(username?: string | undefined, password?: string): Promise<{ ok: boolean; token?: string; error?: string }> {
    const response = await this._fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    // 存储cookie到AsyncStorage
    const cookies = response.headers.get("Set-Cookie");
    if (cookies) {
      await AsyncStorage.setItem("authCookies", cookies);
    }

    const result = await response.json();
    if (result.token) {
      await AsyncStorage.setItem("authToken", result.token);
      if (!cookies) {
        await AsyncStorage.setItem("authCookies", `auth=${result.token}`);
      }
    }

    return result;
  }

  async logout(): Promise<{ ok: boolean }> {
    try {
      const response = await this._fetch("/api/logout", {
        method: "POST",
      });
      return response.json();
    } finally {
      await AsyncStorage.removeItem("authCookies");
      await AsyncStorage.removeItem("authToken");
    }
  }

  async getServerConfig(): Promise<ServerConfig> {
    const response = await this._fetch("/api/server-config");
    return response.json();
  }

  async getFavorites(key?: string): Promise<Record<string, Favorite> | Favorite | null> {
    const url = key ? `/api/favorites?key=${encodeURIComponent(key)}` : "/api/favorites";
    const response = await this._fetch(url);
    return response.json();
  }

  async addFavorite(key: string, favorite: Omit<Favorite, "save_time">): Promise<{ success: boolean }> {
    const response = await this._fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, favorite }),
    });
    return response.json();
  }

  async deleteFavorite(key?: string): Promise<{ success: boolean }> {
    const url = key ? `/api/favorites?key=${encodeURIComponent(key)}` : "/api/favorites";
    const response = await this._fetch(url, { method: "DELETE" });
    return response.json();
  }

  async getPlayRecords(): Promise<Record<string, PlayRecord>> {
    const response = await this._fetch("/api/playrecords");
    return response.json();
  }

  async savePlayRecord(key: string, record: Omit<PlayRecord, "save_time">): Promise<{ success: boolean }> {
    const response = await this._fetch("/api/playrecords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, record }),
    });
    return response.json();
  }

  async deletePlayRecord(key?: string): Promise<{ success: boolean }> {
    const url = key ? `/api/playrecords?key=${encodeURIComponent(key)}` : "/api/playrecords";
    const response = await this._fetch(url, { method: "DELETE" });
    return response.json();
  }

  async getSearchHistory(): Promise<string[]> {
    const response = await this._fetch("/api/searchhistory");
    return response.json();
  }

  async addSearchHistory(keyword: string): Promise<string[]> {
    const response = await this._fetch("/api/searchhistory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword }),
    });
    return response.json();
  }

  async deleteSearchHistory(keyword?: string): Promise<{ success: boolean }> {
    const url = keyword ? `/api/searchhistory?keyword=${keyword}` : "/api/searchhistory";
    const response = await this._fetch(url, { method: "DELETE" });
    return response.json();
  }

  getImageProxyUrl(imageUrl: string): string {
    return `${this.baseURL}/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
  }

  async getDoubanData(
    type: "movie" | "tv",
    tag: string,
    pageSize: number = 16,
    pageStart: number = 0
  ): Promise<DoubanResponse> {
    const url = `/api/douban?type=${type}&tag=${encodeURIComponent(tag)}&pageSize=${pageSize}&pageStart=${pageStart}`;
    const response = await this._fetch(url);
    return response.json();
  }

  async getDoubanCategories(
    kind: "movie" | "tv",
    category: string,
    type: string,
    pageSize: number = 20,
    pageStart: number = 0
  ): Promise<DoubanResponse> {
    const url = `/api/douban/categories?kind=${kind}&category=${encodeURIComponent(category)}&type=${encodeURIComponent(type)}&limit=${pageSize}&start=${pageStart}`;
    const response = await this._fetch(url);
    return response.json();
  }

  async getDoubanRecommends(params: {
    kind: "movie" | "tv";
    category?: string;
    format?: string;
    pageSize?: number;
    pageStart?: number;
  }): Promise<DoubanResponse> {
    const { kind, category = "", format = "", pageSize = 20, pageStart = 0 } = params;
    const url = `/api/douban/recommends?kind=${kind}&limit=${pageSize}&start=${pageStart}&category=${encodeURIComponent(category)}&format=${encodeURIComponent(format)}`;
    const response = await this._fetch(url);
    return response.json();
  }

  async getCategories(): Promise<{ categories: CategoryConfig[] }> {
    const response = await this._fetch("/api/categories");
    return response.json();
  }

  async getBangumiCalendar(): Promise<BangumiCalendarDay[]> {
    const response = await this._fetch("/api/bangumi/calendar");
    return response.json();
  }

  // 以下为客户端直连豆瓣/番组计划的备用实现，用于服务端接口不可用时
  async getDoubanCategoriesDirect(
    kind: "movie" | "tv",
    category: string,
    type: string,
    pageSize: number = 20,
    pageStart: number = 0
  ): Promise<DoubanResponse> {
    const data = await fetchDoubanFromMirrors(
      `/rexxar/api/v2/subject/recent_hot/${kind}?start=${pageStart}&limit=${pageSize}&category=${encodeURIComponent(category)}&type=${encodeURIComponent(type)}`
    );
    const list: DoubanItem[] = (data?.items || []).map((item: any) => ({
      title: item.title,
      poster: item.pic?.normal || item.pic?.large || "",
      rate: item.rating?.value ? item.rating.value.toFixed(1) : "",
      year: item.card_subtitle?.match(/(\d{4})/)?.[1] || "",
    }));
    return { code: 200, message: "获取成功", list };
  }

  async getDoubanRecommendsDirect(params: {
    kind: "movie" | "tv";
    category?: string;
    format?: string;
    pageSize?: number;
    pageStart?: number;
  }): Promise<DoubanResponse> {
    const { kind, category = "", format = "", pageSize = 20, pageStart = 0 } = params;

    const selectedCategories: Record<string, string> = { 类型: category };
    if (format) {
      selectedCategories["形式"] = format;
    }
    const tags = [category, format].filter(Boolean).join(",");

    const query = [
      "refresh=0",
      `start=${pageStart}`,
      `count=${pageSize}`,
      `selected_categories=${encodeURIComponent(JSON.stringify(selectedCategories))}`,
      "uncollect=false",
      "score_range=0,10",
      `tags=${encodeURIComponent(tags)}`,
    ].join("&");

    const data = await fetchDoubanFromMirrors(
      `/rexxar/api/v2/${kind}/recommend?${query}`
    );
    const list: DoubanItem[] = (data?.items || [])
      .filter((item: any) => item.type === "movie" || item.type === "tv")
      .map((item: any) => ({
        title: item.title,
        poster: item.pic?.normal || item.pic?.large || "",
        rate: item.rating?.value ? item.rating.value.toFixed(1) : "",
        year: item.year || "",
      }));
    return { code: 200, message: "获取成功", list };
  }

  async getDoubanListDirect(
    type: "movie" | "tv",
    tag: string,
    pageSize: number = 20,
    pageStart: number = 0
  ): Promise<DoubanResponse> {
    const data = await fetchJsonWithTimeout(
      `https://movie.douban.com/j/search_subjects?type=${type}&tag=${encodeURIComponent(tag)}&sort=recommend&page_limit=${pageSize}&page_start=${pageStart}`,
      DOUBAN_HEADERS
    );
    const list: DoubanItem[] = (data?.subjects || []).map((item: any) => ({
      title: item.title,
      poster: item.cover || "",
      rate: item.rate || "",
      year: "",
    }));
    return { code: 200, message: "获取成功", list };
  }

  async getBangumiCalendarDirect(): Promise<BangumiCalendarDay[]> {
    return fetchJsonWithTimeout("https://api.bgm.tv/calendar");
  }

  async searchVideos(query: string): Promise<{ results: SearchResult[] }> {
    const url = `/api/search?q=${encodeURIComponent(query)}`;
    const response = await this._fetch(url);
    return response.json();
  }

  async searchVideo(query: string, resourceId: string, signal?: AbortSignal): Promise<{ results: SearchResult[] }> {
    const url = `/api/search/one?q=${encodeURIComponent(query)}&resourceId=${encodeURIComponent(resourceId)}`;
    const response = await this._fetch(url, { signal });
    const { results } = await response.json();
    return { results: results.filter((item: any) => item.title === query )};
  }

  async getResources(signal?: AbortSignal): Promise<ApiSite[]> {
    const url = `/api/search/resources`;
    const response = await this._fetch(url, { signal });
    return response.json();
  }

  async getVideoDetail(source: string, id: string): Promise<VideoDetail> {
    const url = `/api/detail?source=${source}&id=${id}`;
    const response = await this._fetch(url);
    return response.json();
  }
}

// 默认实例
export let api = new API();

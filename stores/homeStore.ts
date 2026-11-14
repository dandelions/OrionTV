import { create } from "zustand";
import { api } from "@/services/api";
import type {
  BangumiCalendarDay,
  CategoryTagConfig,
  DoubanItem,
  SearchResult,
  PlayRecord,
} from "@/services/api";
import { PlayRecordManager } from "@/services/storage";
import useAuthStore from "./authStore";
import { useSettingsStore } from "./settingsStore";

export type RowItem = (SearchResult | PlayRecord) & {
  id: string;
  source: string;
  title: string;
  poster: string;
  progress?: number;
  play_time?: number;
  lastPlayed?: number;
  episodeIndex?: number;
  sourceName?: string;
  totalEpisodes?: number;
  year?: string;
  rate?: string;
};

export type CategoryTag = CategoryTagConfig;

export interface Category {
  title: string;
  type?: "record" | "douban";
  tag?: CategoryTag;
  tags?: CategoryTag[];
}

const recordCategory: Category = { title: "最近播放", type: "record" };

// 豆瓣 j/search_subjects 支持按时间排序，服务端 /api/douban 固定 recommend，所以「最新」标签走客户端直连
const LATEST_TAGS: Record<string, CategoryTag> = {
  剧集: { name: "最新", api: "list", kind: "tv", query: "热门", sort: "time" },
  电视剧: { name: "最新", api: "list", kind: "tv", query: "热门", sort: "time" },
  综艺: { name: "最新", api: "list", kind: "tv", query: "综艺", sort: "time" },
};

// 服务端返回的分类会覆盖内置分类，这里补回缺失的「最新」标签
const withLatestTag = (category: Category): Category => {
  const latest = LATEST_TAGS[category.title];
  if (!latest || !category.tags?.length) return category;
  if (category.tags.some((tag) => tag.name === latest.name)) return category;
  return { ...category, tags: [latest, ...category.tags] };
};

// 与 MoonTVPlus 前台（侧边栏 + 豆瓣页选择器）保持一致，服务器未提供 /api/categories 时使用
const baseCategories: Category[] = [
  recordCategory,
  {
    title: "电影",
    type: "douban",
    tags: [
      { name: "热门", api: "categories", kind: "movie", category: "热门", type: "全部" },
      { name: "最新", api: "categories", kind: "movie", category: "最新", type: "全部" },
      { name: "豆瓣高分", api: "categories", kind: "movie", category: "豆瓣高分", type: "全部" },
      { name: "冷门佳片", api: "categories", kind: "movie", category: "冷门佳片", type: "全部" },
      { name: "华语", api: "categories", kind: "movie", category: "热门", type: "华语" },
      { name: "欧美", api: "categories", kind: "movie", category: "热门", type: "欧美" },
      { name: "韩国", api: "categories", kind: "movie", category: "热门", type: "韩国" },
      { name: "日本", api: "categories", kind: "movie", category: "热门", type: "日本" },
    ],
  },
  {
    title: "剧集",
    type: "douban",
    tags: [
      { name: "热门", api: "categories", kind: "tv", category: "tv", type: "tv" },
      { name: "国产", api: "categories", kind: "tv", category: "tv", type: "tv_domestic" },
      { name: "欧美", api: "categories", kind: "tv", category: "tv", type: "tv_american" },
      { name: "日本", api: "categories", kind: "tv", category: "tv", type: "tv_japanese" },
      { name: "韩国", api: "categories", kind: "tv", category: "tv", type: "tv_korean" },
      { name: "动漫", api: "categories", kind: "tv", category: "tv", type: "tv_animation" },
      { name: "纪录片", api: "categories", kind: "tv", category: "tv", type: "tv_documentary" },
    ],
  },
  {
    title: "动漫",
    type: "douban",
    tags: [
      { name: "每日放送", api: "bangumi" },
      { name: "番剧", api: "recommends", kind: "tv", category: "动画", format: "电视剧" },
      { name: "剧场版", api: "recommends", kind: "movie", category: "动画" },
    ],
  },
  {
    title: "综艺",
    type: "douban",
    tags: [
      { name: "热门", api: "categories", kind: "tv", category: "show", type: "show" },
      { name: "国内", api: "categories", kind: "tv", category: "show", type: "show_domestic" },
      { name: "国外", api: "categories", kind: "tv", category: "show", type: "show_foreign" },
    ],
  },
];

const defaultCategories: Category[] = baseCategories.map(withLatestTag);

// 添加缓存项接口
interface CacheItem {
  data: RowItem[];
  timestamp: number;
  type: 'movie' | 'tv' | 'record';
  hasMore: boolean;
}

const CACHE_EXPIRE_TIME = 5 * 60 * 1000; // 5分钟过期
const MAX_CACHE_SIZE = 10; // 最大缓存容量
const MAX_ITEMS_PER_CACHE = 40; // 每个缓存最大条目数
const PAGE_SIZE = 20;

const getCacheKey = (category: Category) => {
  return `${category.title}-${category.tag?.name || ''}`;
};

const isValidCache = (cacheItem: CacheItem) => {
  return Date.now() - cacheItem.timestamp < CACHE_EXPIRE_TIME;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const mapDoubanItems = (list: DoubanItem[]): RowItem[] =>
  list.map((item) => ({
    ...item,
    id: item.title,
    source: "douban",
  })) as RowItem[];

const getTodayBangumiItems = (days: BangumiCalendarDay[]): RowItem[] => {
  if (!Array.isArray(days) || days.length === 0) return [];
  const today = WEEKDAYS[new Date().getDay()];
  const day = days.find((item) => item.weekday?.en === today) || days[0];
  return (day.items || [])
    .filter((item) => item.images)
    .map((item) => ({
      id: String(item.id || item.name),
      source: "douban",
      title: item.name_cn || item.name,
      poster:
        item.images?.large ||
        item.images?.common ||
        item.images?.medium ||
        item.images?.small ||
        item.images?.grid ||
        "",
      rate: item.rating?.score ? item.rating.score.toFixed(1) : "",
      year: item.air_date?.split("-")?.[0] || "",
    })) as RowItem[];
};

const fetchTagItemsFromServer = async (
  tag: CategoryTag,
  pageStart: number
): Promise<{ items: RowItem[]; hasMore: boolean }> => {
  switch (tag.api) {
    case "categories": {
      const result = await api.getDoubanCategories(
        tag.kind || "movie",
        tag.category || "",
        tag.type || "",
        PAGE_SIZE,
        pageStart
      );
      return {
        items: mapDoubanItems(result.list || []),
        hasMore: (result.list || []).length > 0,
      };
    }
    case "recommends": {
      const result = await api.getDoubanRecommends({
        kind: tag.kind || "movie",
        category: tag.category || "",
        format: tag.format || "",
        pageSize: PAGE_SIZE,
        pageStart,
      });
      return {
        items: mapDoubanItems(result.list || []),
        hasMore: (result.list || []).length > 0,
      };
    }
    case "list": {
      const result = await api.getDoubanData(
        tag.kind || "movie",
        tag.query || "",
        PAGE_SIZE,
        pageStart
      );
      return {
        items: mapDoubanItems(result.list || []),
        hasMore: (result.list || []).length > 0,
      };
    }
    case "bangumi": {
      // 每日放送只有一屏，不分页
      if (pageStart > 0) return { items: [], hasMore: false };
      const days = await api.getBangumiCalendar();
      return { items: getTodayBangumiItems(days), hasMore: false };
    }
    default:
      return { items: [], hasMore: false };
  }
};

const fetchTagItemsDirect = async (
  tag: CategoryTag,
  pageStart: number
): Promise<{ items: RowItem[]; hasMore: boolean }> => {
  switch (tag.api) {
    case "categories": {
      const result = await api.getDoubanCategoriesDirect(
        tag.kind || "movie",
        tag.category || "",
        tag.type || "",
        PAGE_SIZE,
        pageStart
      );
      return {
        items: mapDoubanItems(result.list || []),
        hasMore: (result.list || []).length > 0,
      };
    }
    case "recommends": {
      const result = await api.getDoubanRecommendsDirect({
        kind: tag.kind || "movie",
        category: tag.category || "",
        format: tag.format || "",
        pageSize: PAGE_SIZE,
        pageStart,
      });
      return {
        items: mapDoubanItems(result.list || []),
        hasMore: (result.list || []).length > 0,
      };
    }
    case "list": {
      const result = await api.getDoubanListDirect(
        tag.kind || "movie",
        tag.query || "",
        PAGE_SIZE,
        pageStart,
        tag.sort
      );
      return {
        items: mapDoubanItems(result.list || []),
        hasMore: (result.list || []).length > 0,
      };
    }
    case "bangumi": {
      if (pageStart > 0) return { items: [], hasMore: false };
      const days = await api.getBangumiCalendarDirect();
      return { items: getTodayBangumiItems(days), hasMore: false };
    }
    default:
      return { items: [], hasMore: false };
  }
};

// 服务端豆瓣/番组计划接口不可用时，本进程内后续请求直接走客户端直连，避免每次都等待服务端超时
let preferDirectFetch = false;

const fetchTagItems = async (
  tag: CategoryTag,
  pageStart: number
): Promise<{ items: RowItem[]; hasMore: boolean }> => {
  // 按更新时间排序只有豆瓣 j/search_subjects 支持，服务端接口没有该参数
  if (tag.sort === "time") {
    try {
      return await fetchTagItemsDirect(tag, pageStart);
    } catch (directError) {
      console.warn("客户端直连豆瓣失败", directError);
      throw new Error("CATEGORY_FETCH_FAILED");
    }
  }

  if (preferDirectFetch) {
    try {
      return await fetchTagItemsDirect(tag, pageStart);
    } catch (directError) {
      console.warn("客户端直连豆瓣失败", directError);
      throw new Error("CATEGORY_FETCH_FAILED");
    }
  }

  try {
    return await fetchTagItemsFromServer(tag, pageStart);
  } catch (error) {
    // 服务端直连豆瓣/番组计划失败（常见于服务器 IP 被封，接口返回 500）时改用客户端直连
    console.warn("服务端分类接口请求失败，改用客户端直连", error);
    preferDirectFetch = true;
    try {
      return await fetchTagItemsDirect(tag, pageStart);
    } catch (directError) {
      console.warn("客户端直连豆瓣失败", directError);
      throw new Error("CATEGORY_FETCH_FAILED");
    }
  }
};

interface HomeState {
  categories: Category[];
  selectedCategory: Category;
  contentData: RowItem[];
  loading: boolean;
  loadingMore: boolean;
  pageStart: number;
  hasMore: boolean;
  error: string | null;
  loadCategories: () => Promise<void>;
  applyCategories: (categories: Category[]) => void;
  fetchInitialData: () => Promise<void>;
  loadMoreData: () => Promise<void>;
  selectCategory: (category: Category) => void;
  refreshPlayRecords: () => Promise<void>;
  clearError: () => void;
}

// 内存缓存，应用生命周期内有效
const dataCache = new Map<string, CacheItem>();

const useHomeStore = create<HomeState>((set, get) => ({
  categories: defaultCategories,
  selectedCategory: defaultCategories[0],
  contentData: [],
  loading: true,
  loadingMore: false,
  pageStart: 0,
  hasMore: true,
  error: null,

  loadCategories: async () => {
    const { apiBaseUrl } = useSettingsStore.getState();
    if (!apiBaseUrl) {
      get().applyCategories(defaultCategories);
      return;
    }

    try {
      const { categories } = await api.getCategories();
      const remoteCategories = (categories || [])
        .filter((category) => category.tags?.length)
        .map((category) => ({
          title: category.name,
          type: "douban" as const,
          tags: category.tags,
        }));

      if (remoteCategories.length === 0) {
        get().applyCategories(defaultCategories);
        return;
      }

      get().applyCategories([recordCategory, ...remoteCategories.map(withLatestTag)]);
    } catch (err) {
      console.warn("获取服务器分类失败，使用内置分类", err);
      get().applyCategories(defaultCategories);
    }
  },

  applyCategories: (categories: Category[]) => {
    const current = get().selectedCategory;
    const matched = current
      ? categories.find((category) => category.title === current.title)
      : undefined;

    let selectedCategory: Category;
    if (matched) {
      const matchedTag = current?.tag && matched.tags
        ? matched.tags.find((tag) => tag.name === current.tag?.name)
        : undefined;
      selectedCategory = {
        ...matched,
        tag: matched.tags?.length ? matchedTag || matched.tags[0] : undefined,
      };
    } else {
      selectedCategory = categories[0];
    }

    set({ categories, selectedCategory });
  },

  fetchInitialData: async () => {
    const { apiBaseUrl } = useSettingsStore.getState();
    await useAuthStore.getState().checkLoginStatus(apiBaseUrl);

    const { selectedCategory } = get();
    const cacheKey = getCacheKey(selectedCategory);

    // 最近播放不缓存，始终实时获取
    if (selectedCategory.type === 'record') {
      set({ loading: true, contentData: [], pageStart: 0, hasMore: true, error: null });
      await get().loadMoreData();
      return;
    }

    // 检查缓存
    if (dataCache.has(cacheKey) && isValidCache(dataCache.get(cacheKey)!)) {
      const cachedData = dataCache.get(cacheKey)!;
      set({
        loading: false,
        contentData: cachedData.data,
        pageStart: cachedData.data.length,
        hasMore: cachedData.hasMore,
        error: null
      });
      return;
    }

    set({ loading: true, contentData: [], pageStart: 0, hasMore: true, error: null });
    await get().loadMoreData();
  },

  loadMoreData: async () => {
    const { selectedCategory, pageStart, loadingMore, hasMore } = get();
    if (loadingMore || !hasMore) return;

    if (pageStart > 0) {
      set({ loadingMore: true });
    }

    try {
      if (selectedCategory.type === "record") {
        const { isLoggedIn } = useAuthStore.getState();
        if (!isLoggedIn) {
          set({ contentData: [], hasMore: false });
          return;
        }
        const records = await PlayRecordManager.getAll();
        const rowItems = Object.entries(records)
          .map(([key, record]) => {
            const [source, id] = key.split("+");
            return {
              ...record,
              id,
              source,
              progress: record.play_time / record.total_time,
              poster: record.cover,
              sourceName: record.source_name,
              episodeIndex: record.index,
              totalEpisodes: record.total_episodes,
              lastPlayed: record.save_time,
              play_time: record.play_time,
            };
          })
          // .filter((record) => record.progress !== undefined && record.progress > 0 && record.progress < 1)
          .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));

        set({ contentData: rowItems, hasMore: false });
      } else if (selectedCategory.tag) {
        const { items, hasMore: hasMoreItems } = await fetchTagItems(
          selectedCategory.tag,
          pageStart
        );

        const cacheKey = getCacheKey(selectedCategory);

        if (pageStart === 0) {
          // 清理过期缓存
          for (const [key, value] of dataCache.entries()) {
            if (!isValidCache(value)) {
              dataCache.delete(key);
            }
          }

          // 如果缓存太大，删除最旧的项
          if (dataCache.size >= MAX_CACHE_SIZE) {
            const oldestKey = Array.from(dataCache.keys())[0];
            dataCache.delete(oldestKey);
          }

          // 限制缓存的数据条目数，但不限制显示的数据
          const cacheItems = items.slice(0, MAX_ITEMS_PER_CACHE);

          // 存储新缓存
          dataCache.set(cacheKey, {
            data: cacheItems,
            timestamp: Date.now(),
            type: selectedCategory.tag.kind === "tv" ? "tv" : "movie",
            hasMore: hasMoreItems
          });

          set({
            contentData: items, // 使用完整的新数据
            pageStart: items.length,
            hasMore: hasMoreItems,
          });
        } else {
          // 增量加载时更新缓存
          const existingCache = dataCache.get(cacheKey);
          if (existingCache) {
            // 只有当缓存数据少于最大限制时才更新缓存
            if (existingCache.data.length < MAX_ITEMS_PER_CACHE) {
              const updatedData = [...existingCache.data, ...items];
              const limitedCacheData = updatedData.slice(0, MAX_ITEMS_PER_CACHE);

              dataCache.set(cacheKey, {
                ...existingCache,
                data: limitedCacheData,
              });
            }
          }

          // 更新状态时使用所有数据
          set((state) => ({
            contentData: [...state.contentData, ...items],
            pageStart: state.pageStart + items.length,
            hasMore: hasMoreItems,
          }));
        }
      } else {
        // 容器分类未选择子分类时不加载内容
        set({ contentData: [], hasMore: false });
      }
    } catch (err: any) {
      let errorMessage = "加载失败，请重试";

      if (err.message === "API_URL_NOT_SET") {
        errorMessage = "请点击右上角设置按钮，配置您的服务器地址";
      } else if (err.message === "CATEGORY_FETCH_FAILED") {
        errorMessage = "分类数据获取失败，请检查网络连接";
      } else if (err.message === "UNAUTHORIZED") {
        errorMessage = "认证失败，请重新登录";
        useAuthStore.setState({ isLoggedIn: false, isLoginModalVisible: true });
      } else if (err.message.includes("Network")) {
        errorMessage = "网络连接失败，请检查网络连接";
      } else if (err.message.includes("timeout")) {
        errorMessage = "请求超时，请检查网络或服务器状态";
      } else if (err.message.includes("404")) {
        errorMessage = "服务器不支持该分类接口，请升级服务器版本";
      } else if (err.message.includes("500")) {
        errorMessage = "服务器内部错误，请联系管理员";
      } else if (err.message.includes("403")) {
        errorMessage = "访问被拒绝，请检查权限设置";
      }

      set({ error: errorMessage });
    } finally {
      set({ loading: false, loadingMore: false });
    }
  },

  selectCategory: (category: Category) => {
    const currentCategory = get().selectedCategory;
    const cacheKey = getCacheKey(category);

    if (
      currentCategory.title !== category.title ||
      currentCategory.tag?.name !== category.tag?.name
    ) {
      set({
        selectedCategory: category,
        contentData: [],
        pageStart: 0,
        hasMore: true,
        error: null
      });

      if (category.type === 'record') {
        get().fetchInitialData();
        return;
      }

      const cachedData = dataCache.get(cacheKey);
      if (cachedData && isValidCache(cachedData)) {
        set({
          contentData: cachedData.data,
          pageStart: cachedData.data.length,
          hasMore: cachedData.hasMore,
          loading: false
        });
      } else {
        // 删除过期缓存
        if (cachedData) {
          dataCache.delete(cacheKey);
        }
        get().fetchInitialData();
      }
    }
  },

  refreshPlayRecords: async () => {
    const { apiBaseUrl } = useSettingsStore.getState();
    await useAuthStore.getState().checkLoginStatus(apiBaseUrl);
    const { isLoggedIn } = useAuthStore.getState();
    if (!isLoggedIn) {
      set((state) => {
        const recordCategoryExists = state.categories.some((c) => c.type === "record");
        if (recordCategoryExists) {
          const newCategories = state.categories.filter((c) => c.type !== "record");
          if (state.selectedCategory.type === "record") {
            get().selectCategory(newCategories[0] || null);
          }
          return { categories: newCategories };
        }
        return {};
      });
      return;
    }
    const records = await PlayRecordManager.getAll();
    const hasRecords = Object.keys(records).length > 0;
    set((state) => {
      const recordCategoryExists = state.categories.some((c) => c.type === "record");
      if (hasRecords && !recordCategoryExists) {
        return { categories: [recordCategory, ...state.categories] };
      }
      if (!hasRecords && recordCategoryExists) {
        const newCategories = state.categories.filter((c) => c.type !== "record");
        if (state.selectedCategory.type === "record") {
          get().selectCategory(newCategories[0] || null);
        }
        return { categories: newCategories };
      }
      return {};
    });

    get().fetchInitialData();
  },

  clearError: () => {
    set({ error: null });
  },
}));

export default useHomeStore;

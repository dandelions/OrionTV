import React, { useState, useRef, useEffect } from "react";
import { View, TextInput, StyleSheet, Alert, Keyboard, TouchableOpacity, ScrollView } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import VideoCard from "@/components/VideoCard";
import VideoLoadingAnimation from "@/components/VideoLoadingAnimation";
import { api, SearchResult } from "@/services/api";
import { Search, QrCode, Clock, Trash2 } from "lucide-react-native";
import { StyledButton } from "@/components/StyledButton";
import { useRemoteControlStore } from "@/stores/remoteControlStore";
import { RemoteControlModal } from "@/components/RemoteControlModal";
import { useSettingsStore } from "@/stores/settingsStore";
import { SearchHistoryManager } from "@/services/storage";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/Colors";
import CustomScrollView from "@/components/CustomScrollView";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { getCommonResponsiveStyles } from "@/utils/ResponsiveStyles";
import ResponsiveNavigation from "@/components/navigation/ResponsiveNavigation";
import ResponsiveHeader from "@/components/navigation/ResponsiveHeader";
import { DeviceUtils } from "@/utils/DeviceUtils";
import Logger from '@/utils/Logger';
import { MAIN_ROUTES, navigateToMainRoute } from "@/utils/navigation";

const logger = Logger.withTag('SearchScreen');

export default function SearchScreen() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const textInputRef = useRef<TextInput>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const { showModal: showRemoteModal, lastMessage, targetPage, clearMessage } = useRemoteControlStore();
  const { remoteInputEnabled } = useSettingsStore();
  const router = useRouter();

  // 响应式布局配置
  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;

  const loadHistory = async () => {
    try {
      const list = await SearchHistoryManager.get();
      if (Array.isArray(list)) {
        setHistory(list.slice(0, 20));
      }
    } catch (err) {
      logger.info("Failed to load search history:", err);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (lastMessage && targetPage === 'search') {
      logger.debug("Received remote input:", lastMessage);
      const realMessage = lastMessage.split("_")[0];
      setKeyword(realMessage);
      handleSearch(realMessage);
      clearMessage(); // Clear the message after processing
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage, targetPage]);

  const handleSearch = async (searchText?: string) => {
    const term = typeof searchText === "string" ? searchText : keyword;
    if (!term.trim()) {
      Keyboard.dismiss();
      return;
    }
    Keyboard.dismiss();
    setLoading(true);
    setError(null);
    try {
      await SearchHistoryManager.add(term.trim());
      loadHistory();
      const response = await api.searchVideos(term.trim());
      if (response.results.length > 0) {
        setResults(response.results);
      } else {
        setError("没有找到相关内容");
      }
    } catch (err) {
      setError("搜索失败，请稍后重试。");
      logger.info("Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectHistory = (item: string) => {
    setKeyword(item);
    handleSearch(item);
  };

  const handleClearHistory = async () => {
    await SearchHistoryManager.clear();
    setHistory([]);
  };

  const onSearchPress = () => handleSearch();

  const handleQrPress = () => {
    if (!remoteInputEnabled) {
      Alert.alert("远程输入未启用", "请先在设置页面中启用远程输入功能", [
        { text: "取消", style: "cancel" },
        { text: "去设置", onPress: () => navigateToMainRoute(router, MAIN_ROUTES.settings) },
      ]);
      return;
    }
    showRemoteModal('search');
  };

  const renderItem = ({ item }: { item: SearchResult; index: number }) => (
    <VideoCard
      id={item.id.toString()}
      source={item.source}
      title={item.title}
      poster={item.poster}
      year={item.year}
      sourceName={item.source_name}
      api={api}
    />
  );

  // 动态样式
  const dynamicStyles = createResponsiveStyles(deviceType, spacing);

  const renderSearchContent = () => (
    <>
      <View style={dynamicStyles.searchContainer}>
        <TouchableOpacity
          activeOpacity={1}
          style={[
            dynamicStyles.inputContainer,
            {
              borderColor: isInputFocused ? Colors.dark.primary : "transparent",
            },
          ]}
          onPress={() => textInputRef.current?.focus()}
        >
          <TextInput
            ref={textInputRef}
            style={dynamicStyles.input}
            placeholder="搜索电影、剧集..."
            placeholderTextColor="#888"
            value={keyword}
            onChangeText={setKeyword}
            onSubmitEditing={onSearchPress}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            returnKeyType="search"
          />
        </TouchableOpacity>
        <StyledButton style={dynamicStyles.searchButton} onPress={onSearchPress}>
          <Search size={deviceType === 'mobile' ? 20 : 24} color="white" />
        </StyledButton>
        {deviceType !== 'mobile' && (
          <StyledButton style={dynamicStyles.qrButton} onPress={handleQrPress}>
            <QrCode size={deviceType === 'tv' ? 24 : 20} color="white" />
          </StyledButton>
        )}
      </View>

      {loading ? (
        <VideoLoadingAnimation showProgressBar={false} />
      ) : error ? (
        <View style={[commonStyles.center, { flex: 1 }]}>
          <ThemedText style={dynamicStyles.errorText}>{error}</ThemedText>
        </View>
      ) : results.length > 0 ? (
        <CustomScrollView
          data={results}
          renderItem={renderItem}
          loading={loading}
          error={error}
          emptyMessage="没有找到相关内容"
          handleBackToTop={false}
        />
      ) : history.length > 0 ? (
        <ScrollView style={dynamicStyles.historyScrollView} keyboardShouldPersistTaps="handled">
          <View style={dynamicStyles.historyHeader}>
            <View style={dynamicStyles.historyTitleRow}>
              <Clock size={deviceType === "tv" ? 22 : 18} color="#aaa" />
              <ThemedText style={dynamicStyles.historyTitle}>搜索历史</ThemedText>
            </View>
            <TouchableOpacity
              onPress={handleClearHistory}
              style={dynamicStyles.clearButton}
              activeOpacity={0.7}
            >
              <Trash2 size={deviceType === "tv" ? 18 : 16} color="#888" />
              <ThemedText style={dynamicStyles.clearText}>清空</ThemedText>
            </TouchableOpacity>
          </View>
          <View style={dynamicStyles.historyTagsContainer}>
            {history.map((item, index) => (
              <StyledButton
                key={`${item}-${index}`}
                text={item}
                onPress={() => handleSelectHistory(item)}
                style={dynamicStyles.historyChip}
                textStyle={dynamicStyles.historyChipText}
              />
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={[commonStyles.center, { flex: 1 }]}>
          <ThemedText style={dynamicStyles.emptyText}>输入关键词开始搜索</ThemedText>
        </View>
      )}
      <RemoteControlModal />
    </>
  );

  const content = (
    <ThemedView style={[commonStyles.container, dynamicStyles.container]}>
      {renderSearchContent()}
    </ThemedView>
  );

  // 根据设备类型决定是否包装在响应式导航中
  if (deviceType === 'tv') {
    return content;
  }

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader title="搜索" showBackButton />
      {content}
    </ResponsiveNavigation>
  );
}

const createResponsiveStyles = (deviceType: string, spacing: number) => {
  const isMobile = deviceType === 'mobile';
  const minTouchTarget = DeviceUtils.getMinTouchTargetSize();

  return StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: deviceType === 'tv' ? 50 : 0,
    },
    searchContainer: {
      flexDirection: "row",
      paddingHorizontal: spacing,
      marginBottom: spacing,
      alignItems: "center",
      paddingTop: isMobile ? spacing / 2 : 0,
    },
    inputContainer: {
      flex: 1,
      height: isMobile ? minTouchTarget : 50,
      backgroundColor: "#2c2c2e",
      borderRadius: isMobile ? 8 : 8,
      marginRight: spacing / 2,
      borderWidth: 2,
      borderColor: "transparent",
      justifyContent: "center",
    },
    input: {
      flex: 1,
      paddingHorizontal: spacing,
      color: "white",
      fontSize: isMobile ? 16 : 18,
    },
    searchButton: {
      width: isMobile ? minTouchTarget : 50,
      height: isMobile ? minTouchTarget : 50,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: isMobile ? 8 : 8,
      marginRight: deviceType !== 'mobile' ? spacing / 2 : 0,
    },
    qrButton: {
      width: isMobile ? minTouchTarget : 50,
      height: isMobile ? minTouchTarget : 50,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: isMobile ? 8 : 8,
    },
    errorText: {
      color: "red",
      fontSize: isMobile ? 14 : 16,
      textAlign: "center",
    },
    emptyText: {
      color: "#888",
      fontSize: isMobile ? 16 : 20,
    },
    historyScrollView: {
      flex: 1,
      paddingHorizontal: spacing,
      paddingTop: spacing / 2,
    },
    historyHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing,
      paddingHorizontal: 4,
    },
    historyTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    historyTitle: {
      fontSize: isMobile ? 18 : deviceType === "tv" ? 22 : 20,
      fontWeight: "bold",
    },
    clearButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: "rgba(255, 255, 255, 0.08)",
    },
    clearText: {
      fontSize: isMobile ? 13 : 15,
      color: "#888",
    },
    historyTagsContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: isMobile ? 8 : 12,
      paddingBottom: spacing * 2,
    },
    historyChip: {
      paddingHorizontal: isMobile ? 12 : deviceType === "tv" ? 18 : 14,
      paddingVertical: isMobile ? 6 : deviceType === "tv" ? 10 : 8,
      borderRadius: isMobile ? 6 : 8,
      backgroundColor: "#2c2c2e",
      marginBottom: isMobile ? 4 : 6,
    },
    historyChipText: {
      fontSize: isMobile ? 14 : deviceType === "tv" ? 18 : 16,
      color: "#eee",
    },
  });
};

import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { StyledButton } from "@/components/StyledButton";
import { SettingsSection } from "./SettingsSection";
import useAuthStore from "@/stores/authStore";
import { LoginCredentialsManager } from "@/services/storage";
import { Colors } from "@/constants/Colors";

interface AccountSectionProps {
  onFocus?: () => void;
  onBlur?: () => void;
}

export const AccountSection: React.FC<AccountSectionProps> = ({ onFocus, onBlur }) => {
  const { isLoggedIn, showLoginModal, logout } = useAuthStore();
  const [username, setUsername] = useState<string>("");

  useEffect(() => {
    const fetchUser = async () => {
      const creds = await LoginCredentialsManager.get();
      if (creds?.username) {
        setUsername(creds.username);
      } else {
        setUsername("");
      }
    };
    fetchUser();
  }, [isLoggedIn]);

  return (
    <SettingsSection focusable={false} onFocus={onFocus} onBlur={onBlur}>
      <View style={styles.header}>
        <ThemedText style={styles.sectionTitle}>账号管理</ThemedText>
        <ThemedText style={styles.statusText}>
          状态：
          <ThemedText style={{ color: isLoggedIn ? Colors.dark.primary : "#FF6B6B" }}>
            {isLoggedIn ? (username ? `已登录 (${username})` : "已登录") : "未登录"}
          </ThemedText>
        </ThemedText>
      </View>

      <View style={styles.buttonRow}>
        <StyledButton
          text={isLoggedIn ? "切换账号" : "立即登录"}
          onPress={showLoginModal}
          variant="primary"
          style={styles.actionButton}
        />
        {isLoggedIn && (
          <StyledButton
            text="退出登录"
            onPress={logout}
            variant="ghost"
            style={styles.actionButton}
          />
        )}
      </View>
    </SettingsSection>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  statusText: {
    fontSize: 14,
    color: "#888",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    minHeight: 44,
    minWidth: 120,
    flex: 1,
  },
});

<template>
  <div class="page-shell">
    <PageHeader
      eyebrow="Quản lý người dùng"
      title="Quản lý tài khoản và quyền truy cập"
      description="Màn admin để tạo tài khoản, quan sát role catalog và kiểm soát quyền truy cập nội bộ."
    />

    <div v-if="loadError" class="alert alert-danger">
      {{ loadError }}
    </div>

    <div class="grid-auto">
      <StatCard
        label="Tài khoản"
        :value="String(users.length)"
        description="Tổng số tài khoản backend đang trả về trong permission scope hiện tại."
      />
      <StatCard
        label="Catalog role"
        :value="String(roles.length)"
        description="Catalog role seeded cho auth slice hiện tại."
      />
      <StatCard
        label="Quyền hạn"
        :value="String(permissions.length)"
        description="Snapshot permission đang được frontend gate và hiển thị."
      />
    </div>

    <div class="accounts-grid">
      <PermissionGate :permissions="[permissionCodes.CREATE_USER]">
        <UserForm :roles="roles" :pending="creating" @submit="handleCreateUser" />
      </PermissionGate>

      <section class="content-card stack-md">
        <PageHeader
          eyebrow="Catalog quyền"
          title="Role và permission hiện có"
          description="Catalog hiện tại vẫn là tĩnh. Màn này ưu tiên cho admin theo dõi và kiểm tra contract auth."
        />

        <div class="catalog-grid">
          <section class="catalog-block">
            <div class="catalog-head">
              <h3>Role</h3>
              <span class="pill">{{ roles.length }}</span>
            </div>

            <div class="stack-sm">
              <article v-for="role in roles" :key="role.id" class="catalog-item">
                <strong>{{ role.name }}</strong>
                <p class="muted">
                  {{ role.description || "Role seeded cho auth slice hiện tại." }}
                </p>
              </article>
            </div>
          </section>

          <section class="catalog-block">
            <div class="catalog-head">
              <h3>Quyền hạn</h3>
              <span class="pill">{{ permissions.length }}</span>
            </div>

            <div class="stack-sm">
              <article
                v-for="permission in permissions"
                :key="permission.id"
                class="catalog-item catalog-item-tight"
              >
                <strong>{{ permission.code }}</strong>
                <p class="muted">
                  {{ permission.description || permission.name }}
                </p>
              </article>
            </div>
          </section>
        </div>
      </section>
    </div>

    <section class="content-card stack-md">
      <PageHeader
        eyebrow="Tài khoản"
        title="Danh sách tài khoản"
        description="Các thao tác role, reset mật khẩu và bật/tắt user đều bám trực tiếp vào auth/admin API."
      />

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Định danh</th>
              <th>Tên hiển thị</th>
              <th>Email</th>
              <th>Role</th>
              <th>Trạng thái</th>
              <th>Lần đầu đăng nhập</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="users.length === 0">
              <td colspan="7" class="muted">
                Chưa có dữ liệu hoặc backend chưa trả danh sách user.
              </td>
            </tr>
            <tr v-for="user in users" :key="user.id">
              <td>{{ user.identifier }}</td>
              <td>{{ user.displayName }}</td>
              <td>{{ user.email || "n/a" }}</td>
              <td>
                <select
                  :value="roleSelections[user.id] ?? user.roleIds[0]"
                  :disabled="actionPending[user.id]"
                  @change="handleRoleSelection(user.id, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="role in roles" :key="role.id" :value="role.id">
                    {{ role.name }}
                  </option>
                </select>
              </td>
              <td>{{ user.isActive ? "Đang hoạt động" : "Đã khóa" }}</td>
              <td>{{ user.mustChangePassword ? "Phải đổi mật khẩu" : "Sẵn sàng" }}</td>
              <td>
                <div class="button-row">
                  <button
                    class="button button-ghost"
                    type="button"
                    :disabled="!canAssignRole || actionPending[user.id] || !roleSelections[user.id]"
                    @click="handleAssignRole(user)"
                  >
                    Lưu role
                  </button>
                  <button
                    class="button button-ghost"
                    type="button"
                    :disabled="!canResetPassword || actionPending[user.id]"
                    @click="handleResetPassword(user)"
                  >
                    Reset mật khẩu
                  </button>
                  <button
                    class="button button-ghost"
                    type="button"
                    :disabled="!canToggleUser || actionPending[user.id]"
                    @click="handleToggleUser(user)"
                  >
                    {{ user.isActive ? "Khóa" : "Mở khóa" }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { permissionCodes } from "@/modules/auth/permissions";
import PermissionGate from "@/modules/auth/components/PermissionGate.vue";
import { useAuthStore } from "@/modules/auth/store";
import { adminAccountsApi } from "@/modules/admin-accounts/api";
import UserForm from "@/modules/admin-accounts/components/UserForm.vue";
import type {
  AdminUser,
  CreateUserPayload,
  PermissionSummary,
  RoleSummary
} from "@/modules/admin-accounts/types";
import PageHeader from "@/shared/components/PageHeader.vue";
import StatCard from "@/shared/components/StatCard.vue";

const authStore = useAuthStore();
const users = ref<AdminUser[]>([]);
const roles = ref<RoleSummary[]>([]);
const permissions = ref<PermissionSummary[]>([]);
const loadError = ref("");
const creating = ref(false);
const actionPending = reactive<Record<number, boolean>>({});
const roleSelections = reactive<Record<number, number>>({});

const canAssignRole = computed(() => authStore.hasAllPermissions([permissionCodes.ASSIGN_ROLE]));
const canResetPassword = computed(() =>
  authStore.hasAllPermissions([permissionCodes.RESET_USER_PASSWORD])
);
const canToggleUser = computed(() =>
  authStore.hasAllPermissions([permissionCodes.UPDATE_USER, permissionCodes.DISABLE_USER])
);

async function loadData() {
  if (!authStore.accessToken) {
    return;
  }

  loadError.value = "";

  const [usersResult, rolesResult, permissionsResult] = await Promise.allSettled([
    adminAccountsApi.getUsers(authStore.accessToken),
    adminAccountsApi.getRoles(authStore.accessToken),
    adminAccountsApi.getPermissions(authStore.accessToken)
  ]);

  if (rolesResult.status === "fulfilled") {
    roles.value = rolesResult.value;
  }

  if (usersResult.status === "fulfilled") {
    users.value = usersResult.value.items ?? [];

    for (const user of users.value) {
      roleSelections[user.id] = user.roleIds[0] ?? roles.value[0]?.id ?? 0;
    }
  }

  if (permissionsResult.status === "fulfilled") {
    permissions.value = permissionsResult.value;
  }

  const failures = [usersResult, rolesResult, permissionsResult].filter(
    (result) => result.status === "rejected"
  );

  if (failures.length > 0) {
    loadError.value = "Backend auth/admin API chưa sẵn sàng hoặc contract response chưa khớp.";
  }
}

async function handleCreateUser(payload: CreateUserPayload) {
  if (!authStore.accessToken) {
    return;
  }

  creating.value = true;
  loadError.value = "";

  try {
    await adminAccountsApi.createUser(authStore.accessToken, payload);
    await loadData();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "Tạo user thất bại.";
  } finally {
    creating.value = false;
  }
}

function handleRoleSelection(userId: number, nextRoleId: string) {
  roleSelections[userId] = Number(nextRoleId);
}

async function handleAssignRole(user: AdminUser) {
  if (!authStore.accessToken) {
    return;
  }

  actionPending[user.id] = true;
  loadError.value = "";

  try {
    await adminAccountsApi.assignRole(authStore.accessToken, user.id, {
      roleIds: [roleSelections[user.id]]
    });
    await loadData();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "Gán role thất bại.";
  } finally {
    actionPending[user.id] = false;
  }
}

async function handleResetPassword(user: AdminUser) {
  if (!authStore.accessToken) {
    return;
  }

  const temporaryPassword = window.prompt(
    `Nhập mật khẩu tạm mới cho ${user.identifier}`,
    "TempReset!2026A"
  );

  if (!temporaryPassword) {
    return;
  }

  actionPending[user.id] = true;
  loadError.value = "";

  try {
    await adminAccountsApi.resetPassword(authStore.accessToken, user.id, {
      temporaryPassword
    });
    await loadData();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "Reset mật khẩu thất bại.";
  } finally {
    actionPending[user.id] = false;
  }
}

async function handleToggleUser(user: AdminUser) {
  if (!authStore.accessToken) {
    return;
  }

  actionPending[user.id] = true;
  loadError.value = "";

  try {
    await adminAccountsApi.updateUser(authStore.accessToken, user.id, {
      isActive: !user.isActive
    });
    await loadData();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "Cập nhật user thất bại.";
  } finally {
    actionPending[user.id] = false;
  }
}

onMounted(async () => {
  await loadData();
});
</script>

<style scoped>
.accounts-grid {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(320px, 0.9fr) minmax(0, 1.1fr);
  align-items: start;
}

.catalog-grid {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.catalog-block {
  display: grid;
  gap: 14px;
}

.catalog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.catalog-head h3 {
  margin: 0;
}

.catalog-item {
  display: grid;
  gap: 8px;
  padding: 16px 18px;
  background: rgba(243, 248, 255, 0.88);
  border: 1px solid rgba(145, 168, 201, 0.18);
  border-radius: 20px;
}

.catalog-item p {
  margin: 0;
}

.catalog-item-tight strong {
  font-size: 0.96rem;
}

@media (max-width: 1040px) {
  .accounts-grid {
    grid-template-columns: 1fr;
  }
}
</style>

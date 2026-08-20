use crate::testing::TempPool;

pub(super) fn pool() -> TempPool {
    crate::testing::temp_pool("admin")
}

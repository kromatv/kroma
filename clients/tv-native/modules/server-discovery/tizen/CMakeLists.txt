file(GLOB _server_discovery_sources CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/*.cpp")
target_sources(${RN_TIZEN_LIBRARY_TARGET} PRIVATE ${_server_discovery_sources})

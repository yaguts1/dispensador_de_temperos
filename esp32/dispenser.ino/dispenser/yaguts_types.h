// yaguts_types.h
#pragma once
#include <Arduino.h>  // garante que String está definido

struct ApiEndpoint {
  String host;
  uint16_t port;
  bool https;
};

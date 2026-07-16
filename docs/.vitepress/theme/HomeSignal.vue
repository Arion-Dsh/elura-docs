<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { lang } = useData()
const isZh = computed(() => lang.value.startsWith('zh'))
</script>

<template>
  <div class="signal-card" aria-hidden="true">
    <div class="signal-card__bar">
      <span class="signal-card__eyebrow">ELURA / RUNTIME</span>
      <span class="signal-card__live"><i />{{ isZh ? '运行中' : 'LIVE' }}</span>
    </div>

    <div class="signal-card__route">
      <div class="signal-node signal-node--client">
        <span>01</span>
        <strong>{{ isZh ? '客户端' : 'CLIENT' }}</strong>
        <small>ELR2 / WS</small>
      </div>
      <div class="signal-link"><i /><i /><i /></div>
      <div class="signal-node signal-node--gateway">
        <span>02</span>
        <strong>GATEWAY</strong>
        <small>{{ isZh ? '会话 · 认证' : 'SESSION · AUTH' }}</small>
      </div>
      <div class="signal-link"><i /><i /><i /></div>
      <div class="signal-node signal-node--world">
        <span>03</span>
        <strong>WORLD</strong>
        <small>{{ isZh ? '路由 · 状态' : 'ROUTES · STATE' }}</small>
      </div>
    </div>

    <div class="signal-card__telemetry">
      <div>
        <span>{{ isZh ? '传输协议' : 'TRANSPORT' }}</span>
        <strong>TCP · QUIC · WS</strong>
      </div>
      <div>
        <span>{{ isZh ? '部署形态' : 'TOPOLOGY' }}</span>
        <strong>{{ isZh ? '单体 / 分布式' : 'MONO / DISTRIBUTED' }}</strong>
      </div>
      <div>
        <span>{{ isZh ? '游戏路由' : 'GAME ROUTES' }}</span>
        <strong>100+</strong>
      </div>
    </div>
  </div>
</template>

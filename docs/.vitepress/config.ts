import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'claudefi',
    description: 'Autonomous DeFi Trading Agent powered by Claude Agent SDK',

    head: [
      ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }]
    ],

    themeConfig: {
      logo: '/icon.png',

      nav: [
        { text: 'Guide', link: '/getting-started/quick-start' },
        { text: 'Domains', link: '/domains/overview' },
        { text: 'Reference', link: '/reference/commands' },
        {
          text: 'GitHub',
          link: 'https://github.com/claudefi/claudefi'
        }
      ],

      sidebar: [
        {
          text: 'Getting Started',
          items: [
            { text: 'Quick Start', link: '/getting-started/quick-start' },
            { text: 'Installation', link: '/getting-started/installation' },
            { text: 'Configuration', link: '/getting-started/configuration' },
            { text: 'TUI Dashboard', link: '/getting-started/tui' }
          ]
        },
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/architecture/overview' },
            { text: 'The Ralph Loop', link: '/architecture/ralph-loop' },
            { text: 'Directory Structure', link: '/architecture/directory-structure' }
          ]
        },
        {
          text: 'Trading Domains',
          items: [
            { text: 'Overview', link: '/domains/overview' },
            { text: 'DLMM (Meteora)', link: '/domains/dlmm' },
            { text: 'Perps (Hyperliquid)', link: '/domains/perps' },
            { text: 'Spot (Memecoins)', link: '/domains/spot' },
            { text: 'Polymarket', link: '/domains/polymarket' }
          ]
        },
        {
          text: 'MCP Server',
          items: [
            { text: 'Overview', link: '/mcp-server/overview' },
            { text: 'Tool Reference', link: '/mcp-server/tools' },
            { text: 'Custom Tools', link: '/mcp-server/custom-tools' }
          ]
        },
        {
          text: 'Skills System',
          items: [
            { text: 'Overview', link: '/skills/overview' },
            { text: 'Custom Skills', link: '/skills/custom-skills' },
            { text: 'Skill Types', link: '/skills/types' },
            { text: 'Generation', link: '/skills/generation' },
            { text: 'Effectiveness', link: '/skills/effectiveness' }
          ]
        },
        {
          text: 'Hooks System',
          items: [
            { text: 'Overview', link: '/hooks/overview' },
            { text: 'Built-in Hooks', link: '/hooks/built-in' },
            { text: 'Custom Hooks', link: '/hooks/custom-hooks' }
          ]
        },
        {
          text: 'Clients',
          items: [
            { text: 'Meteora', link: '/clients/meteora' },
            { text: 'Hyperliquid', link: '/clients/hyperliquid' },
            { text: 'Jupiter', link: '/clients/jupiter' },
            { text: 'Polymarket', link: '/clients/polymarket' }
          ]
        },
        {
          text: 'Trading',
          items: [
            { text: 'Paper Trading', link: '/trading/paper-trading' },
            { text: 'Real Trading', link: '/trading/real-trading' },
            { text: 'Risk Management', link: '/trading/risk-management' }
          ]
        },
        {
          text: 'Database',
          items: [
            { text: 'Schema', link: '/database/schema' }
          ]
        },
        {
          text: 'Reference',
          items: [
            { text: 'Environment Variables', link: '/reference/environment-variables' },
            { text: 'Commands', link: '/reference/commands' },
            { text: 'API Links', link: '/reference/api-links' }
          ]
        }
      ],

      socialLinks: [
        { icon: 'github', link: 'https://github.com/claudefi/claudefi' }
      ],

      editLink: {
        pattern: 'https://github.com/claudefi/claudefi/edit/main/docs/:path',
        text: 'edit this page'
      },

      footer: {
        message: 'built for the trenches',
        copyright: 'claudefi.com'
      },

      search: {
        provider: 'local'
      }
    },

    mermaid: {
      theme: 'dark'
    }
  })
)

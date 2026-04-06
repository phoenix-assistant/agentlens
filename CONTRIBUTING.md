# Contributing to AgentLens

Thanks for your interest in contributing! 🎉

## Quick Start

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/agentlens
cd agentlens

# Install dependencies
npm install

# Start development
npm run dev

# Run tests
npm test
```

## Development Workflow

1. **Fork** the repository
2. **Create a branch** from `main`: `git checkout -b feature/my-feature`
3. **Make changes** and add tests
4. **Run checks**: `npm run lint && npm test`
5. **Commit** with a descriptive message
6. **Push** and open a Pull Request

## Project Structure

```
agentlens/
├── packages/
│   ├── sdk/           # Core SDK
│   ├── collector/     # Event collector service
│   ├── integrations/  # Framework integrations
│   ├── cli/           # Command-line tool
│   └── mcp/           # MCP server for Claude Code
├── apps/
│   └── dashboard/     # React dashboard
└── docs/              # Documentation
```

## Code Style

- TypeScript with strict mode
- ESLint + Prettier for formatting
- Conventional commits preferred

## Adding an Integration

1. Create file in `packages/integrations/src/<provider>.ts`
2. Export wrapper function following existing patterns
3. Add tests in `packages/integrations/tests/`
4. Update `packages/integrations/src/index.ts`
5. Document in README

## Testing

```bash
# All tests
npm test

# Specific package
npm test --workspace=@phoenixaihub/sdk

# Watch mode
npm test -- --watch
```

## Commit Messages

We use conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance

## Questions?

- Open an issue for bugs or features
- Start a discussion for questions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under MIT.

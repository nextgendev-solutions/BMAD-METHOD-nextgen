const path = require('node:path');
const fs = require('fs-extra');
const yaml = require('js-yaml');
const chalk = require('chalk');

/**
 * IO Adapter Injector
 *
 * Injects IO adapters (Confluence/Jira integration) into workflow.xml at install time.
 * Uses pattern matching to find insertion points - no upstream modifications required.
 *
 * Architecture:
 * - Modules define io-adapter.yaml in _module-installer/
 * - Each adapter specifies a regex pattern and content to inject
 * - Injection happens after module installation, before manifest generation
 * - Deduplication markers prevent duplicate injection on reinstall
 */
class IOAdapterInjector {
  constructor(getModulePath) {
    this.getModulePath = getModulePath;
  }

  /**
   * Process all IO adapter injections for installed modules
   * @param {string} bmadDir - Path to installed bmad directory
   * @param {string[]} installedModules - List of installed module names
   * @returns {Promise<InjectionResult>} Results of the injection process
   */
  async processAll(bmadDir, installedModules) {
    const result = this.createEmptyResult();

    for (const moduleName of installedModules) {
      await this.processModule(moduleName, bmadDir, result);
    }

    this.reportWarnings(result.warnings);
    return result;
  }

  /**
   * Process IO adapters for a single module
   * @private
   */
  async processModule(moduleName, bmadDir, result) {
    const config = await this.loadAdapterConfig(moduleName);

    if (!config) {
      return; // Module doesn't define IO adapters
    }

    if (!config.enabled) {
      console.log(chalk.dim(`  IO adapters disabled for module: ${moduleName}`));
      return;
    }

    if (!config.adapters) {
      return;
    }

    for (const [adapterName, adapter] of Object.entries(config.adapters)) {
      await this.processAdapter(moduleName, adapterName, adapter, bmadDir, result);
    }
  }

  /**
   * Process a single adapter injection
   * @private
   */
  async processAdapter(moduleName, adapterName, adapter, bmadDir, result) {
    const validation = this.validateAdapter(adapterName, adapter);
    if (!validation.valid) {
      result.warnings.push(validation.error);
      return;
    }

    const targetPath = path.join(bmadDir, adapter.target_file);

    if (!(await fs.pathExists(targetPath))) {
      result.warnings.push(`Target file not found for ${adapterName}: ${adapter.target_file}`);
      return;
    }

    const content = await fs.readFile(targetPath, 'utf8');

    if (this.isAlreadyInjected(content, adapterName)) {
      console.log(chalk.dim(`  Adapter ${adapterName} already present, skipping`));
      return;
    }

    const injection = this.injectContent(content, adapter, adapterName);

    if (injection.success) {
      await fs.writeFile(targetPath, injection.content, 'utf8');
      this.recordSuccess(result, targetPath, moduleName, adapterName, injection.type);
    } else {
      result.warnings.push(this.formatPatternWarning(adapterName, adapter));
    }
  }

  /**
   * Load and parse io-adapter.yaml for a module
   * @private
   */
  async loadAdapterConfig(moduleName) {
    const moduleSourcePath = this.getModulePath(moduleName);
    const configPath = path.join(moduleSourcePath, '_module-installer', 'io-adapter.yaml');

    if (!(await fs.pathExists(configPath))) {
      return null;
    }

    try {
      const content = await fs.readFile(configPath, 'utf8');
      return yaml.load(content);
    } catch (error) {
      console.log(chalk.yellow(`  Warning: Failed to parse io-adapter.yaml for ${moduleName}: ${error.message}`));
      return null;
    }
  }

  /**
   * Validate adapter configuration
   * @private
   */
  validateAdapter(adapterName, adapter) {
    if (!adapter.target_file) {
      return { valid: false, error: `Adapter ${adapterName} missing target_file` };
    }
    if (!adapter.content) {
      return { valid: false, error: `Adapter ${adapterName} missing content` };
    }
    if (!adapter.insert_after_pattern && !adapter.insert_before_pattern) {
      return { valid: false, error: `Adapter ${adapterName} missing insertion pattern` };
    }
    return { valid: true };
  }

  /**
   * Check if adapter is already injected (deduplication)
   * @private
   */
  isAlreadyInjected(content, adapterName) {
    const marker = this.createMarker(adapterName);
    return content.includes(marker);
  }

  /**
   * Create deduplication marker for adapter
   * @private
   */
  createMarker(adapterName) {
    return `<!-- IO_ADAPTER:${adapterName} -->`;
  }

  /**
   * Inject adapter content into target file content
   * @private
   */
  injectContent(content, adapter, adapterName) {
    const marker = this.createMarker(adapterName);
    const markedContent = `${marker}\n${adapter.content}`;

    if (adapter.insert_after_pattern) {
      return this.injectAfter(content, adapter.insert_after_pattern, markedContent);
    }

    if (adapter.insert_before_pattern) {
      return this.injectBefore(content, adapter.insert_before_pattern, markedContent);
    }

    return { success: false };
  }

  /**
   * Insert content after a matched pattern
   * @private
   */
  injectAfter(content, patternStr, markedContent) {
    const pattern = new RegExp(patternStr);

    if (!pattern.test(content)) {
      return { success: false };
    }

    const newContent = content.replace(pattern, `$1${markedContent}`);
    return { success: true, content: newContent, type: 'insert_after' };
  }

  /**
   * Insert content before a matched pattern (between capture groups)
   * @private
   */
  injectBefore(content, patternStr, markedContent) {
    const pattern = new RegExp(patternStr);

    if (!pattern.test(content)) {
      return { success: false };
    }

    const newContent = content.replace(pattern, `$1${markedContent}$2`);
    return { success: true, content: newContent, type: 'insert_before' };
  }

  /**
   * Record successful injection
   * @private
   */
  recordSuccess(result, targetPath, moduleName, adapterName, type) {
    if (!result.filesModified.includes(targetPath)) {
      result.filesModified.push(targetPath);
    }
    result.adaptersApplied.push(`${moduleName}:${adapterName}`);
    console.log(chalk.green(`  ✓ Injected ${adapterName} (${type})`));
  }

  /**
   * Format warning message for pattern not found
   * @private
   */
  formatPatternWarning(adapterName, adapter) {
    const pattern = adapter.insert_after_pattern || adapter.insert_before_pattern;
    const preview = pattern.slice(0, 50);
    return (
      `Pattern not found for ${adapterName} in ${adapter.target_file}. ` +
      `The upstream file structure may have changed. Pattern: ${preview}...`
    );
  }

  /**
   * Report warnings to console
   * @private
   */
  reportWarnings(warnings) {
    if (warnings.length === 0) {
      return;
    }

    console.log(chalk.yellow('\n  IO Adapter Warnings:'));
    for (const warning of warnings) {
      console.log(chalk.yellow(`    ⚠ ${warning}`));
    }
  }

  /**
   * Create empty result object
   * @private
   */
  createEmptyResult() {
    return {
      filesModified: [],
      adaptersApplied: [],
      warnings: [],
    };
  }
}

module.exports = { IOAdapterInjector };

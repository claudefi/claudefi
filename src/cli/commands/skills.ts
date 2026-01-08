import { Command } from 'commander';
import chalk from 'chalk';
import { fetchCommunitySkills, searchCommunitySkills } from '../../skills/community/registry.js';
import {
  installSkill,
  uninstallSkill,
  getInstalledSkills,
  isSkillInstalled,
} from '../../skills/community/installer.js';

function formatList(skills: Awaited<ReturnType<typeof fetchCommunitySkills>>): void {
  if (skills.length === 0) {
    console.log(chalk.yellow('No skills found.'));
    return;
  }

  for (const skill of skills) {
    const status = skill.domain ? chalk.dim(`[${skill.domain}]`) : '';
    console.log(`${chalk.green(skill.name)} ${status}`);
    console.log(`  ${skill.description}`);
    if (skill.author) {
      console.log(`  Author: ${skill.author}`);
    }
    if (skill.downloads !== undefined) {
      console.log(`  Downloads: ${skill.downloads} | Rating: ${skill.rating ?? 0}`);
    }
    if (skill.githubUrl) {
      console.log(`  Repo: ${skill.githubUrl}`);
    }
    console.log('');
  }
}

export function registerSkillsCommand(program: Command): void {
  const skills = program.command('skills').description('manage community and installed skills');

  skills
    .command('list')
    .description('list community skills (default)')
    .option('-d, --domain <domain>', 'filter by domain (dlmm, perps, spot, polymarket)')
    .option('-l, --limit <number>', 'max number of skills to show', value => parseInt(value, 10), 20)
    .action(async (options) => {
      const list = await fetchCommunitySkills({
        domain: options.domain,
        limit: options.limit,
      });
      formatList(list);
    });

  skills
    .command('installed')
    .description('list installed local skills')
    .action(async () => {
      const installed = await getInstalledSkills();
      if (installed.length === 0) {
        console.log(chalk.yellow('No community skills installed.'));
        return;
      }
      console.log(chalk.green(`Installed skills (${installed.length}):`));
      installed.forEach(name => console.log(`  • ${name}`));
    });

  skills
    .command('search <query>')
    .description('search community registry by name/description')
    .action(async (query) => {
      const results = await searchCommunitySkills(query);
      formatList(results);
    });

  skills
    .command('install <name>')
    .description('install a community skill by name')
    .action(async (name) => {
      const result = await installSkill(name);
      if (result.success) {
        console.log(chalk.green(result.message));
        if (result.filepath) {
          console.log(`  Path: ${result.filepath}`);
        }
      } else {
        console.error(chalk.red(result.message));
      }
    });

  skills
    .command('remove <name>')
    .alias('uninstall')
    .description('remove an installed community skill')
    .action(async (name) => {
      const installed = await isSkillInstalled(name);
      if (!installed) {
        console.error(chalk.red(`Skill "${name}" is not installed.`));
        return;
      }
      const result = await uninstallSkill(name);
      if (result.success) {
        console.log(chalk.green(result.message));
      } else {
        console.error(chalk.red(result.message));
      }
    });
}

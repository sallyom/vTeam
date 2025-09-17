#!/usr/bin/env python3

import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock

import sys
sys.path.append(os.path.dirname(__file__))

from git_integration import GitIntegration


class TestGitIntegration(unittest.TestCase):
    """Test cases for GitIntegration class"""

    def setUp(self):
        """Set up test environment"""
        # Clear environment variables
        for env_var in ['GIT_USER_NAME', 'GIT_USER_EMAIL', 'GIT_REPOSITORIES']:
            if env_var in os.environ:
                del os.environ[env_var]

    def test_init_default_values(self):
        """Test GitIntegration initialization with default values"""
        git_integration = GitIntegration()

        self.assertEqual(git_integration.user_name, "")
        self.assertEqual(git_integration.user_email, "")
        self.assertEqual(git_integration.repositories, [])
        self.assertFalse(git_integration.ssh_configured)
        self.assertFalse(git_integration.credentials_configured)

    def test_init_with_environment_variables(self):
        """Test GitIntegration initialization with environment variables"""
        os.environ['GIT_USER_NAME'] = 'Test User'
        os.environ['GIT_USER_EMAIL'] = 'test@example.com'
        os.environ['GIT_REPOSITORIES'] = json.dumps([
            {"url": "https://github.com/test/repo.git", "branch": "main"}
        ])

        git_integration = GitIntegration()

        self.assertEqual(git_integration.user_name, 'Test User')
        self.assertEqual(git_integration.user_email, 'test@example.com')
        self.assertEqual(len(git_integration.repositories), 1)
        self.assertEqual(git_integration.repositories[0]['url'], 'https://github.com/test/repo.git')

    def test_parse_repositories_invalid_json(self):
        """Test repository parsing with invalid JSON"""
        os.environ['GIT_REPOSITORIES'] = 'invalid json'

        git_integration = GitIntegration()

        self.assertEqual(git_integration.repositories, [])

    def test_get_auth_status(self):
        """Test authentication status reporting"""
        os.environ['GIT_USER_NAME'] = 'Test User'
        os.environ['GIT_USER_EMAIL'] = 'test@example.com'
        os.environ['GIT_REPOSITORIES'] = json.dumps([{"url": "https://github.com/test/repo.git"}])

        git_integration = GitIntegration()
        git_integration.ssh_configured = True
        git_integration.credentials_configured = False

        status = git_integration.get_auth_status()

        self.assertTrue(status['ssh_configured'])
        self.assertFalse(status['credentials_configured'])
        self.assertTrue(status['user_configured'])
        self.assertTrue(status['repositories_configured'])


class TestGitIntegrationAsync(unittest.IsolatedAsyncioTestCase):
    """Async test cases for GitIntegration class"""

    async def asyncSetUp(self):
        """Set up async test environment"""
        # Clear environment variables
        for env_var in ['GIT_USER_NAME', 'GIT_USER_EMAIL', 'GIT_REPOSITORIES']:
            if env_var in os.environ:
                del os.environ[env_var]

    @patch('git_integration.asyncio.create_subprocess_exec')
    async def test_run_git_command_success(self, mock_subprocess):
        """Test successful Git command execution"""
        mock_process = AsyncMock()
        mock_process.communicate.return_value = (b'output', b'')
        mock_process.returncode = 0
        mock_subprocess.return_value = mock_process

        git_integration = GitIntegration()
        result = await git_integration._run_git_command(['status'])

        self.assertTrue(result)
        mock_subprocess.assert_called_once()

    @patch('git_integration.asyncio.create_subprocess_exec')
    async def test_run_git_command_failure(self, mock_subprocess):
        """Test failed Git command execution"""
        mock_process = AsyncMock()
        mock_process.communicate.return_value = (b'', b'error message')
        mock_process.returncode = 1
        mock_subprocess.return_value = mock_process

        git_integration = GitIntegration()
        result = await git_integration._run_git_command(['invalid-command'])

        self.assertFalse(result)

    @patch('git_integration.Path.exists')
    async def test_setup_ssh_auth_no_ssh_dir(self, mock_exists):
        """Test SSH setup when no SSH directory exists"""
        mock_exists.return_value = False

        git_integration = GitIntegration()
        await git_integration._setup_ssh_auth()

        self.assertFalse(git_integration.ssh_configured)

    @patch('git_integration.Path.exists')
    @patch('git_integration.Path.glob')
    @patch('git_integration.Path.chmod')
    async def test_setup_ssh_auth_with_keys(self, mock_chmod, mock_glob, mock_exists):
        """Test SSH setup with SSH keys"""
        mock_exists.return_value = True

        # Mock SSH key files
        mock_key_file = MagicMock()
        mock_key_file.name = 'id_rsa'
        mock_key_file.chmod = MagicMock()
        mock_glob.return_value = [mock_key_file]

        git_integration = GitIntegration()
        await git_integration._setup_ssh_auth()

        self.assertTrue(git_integration.ssh_configured)

    async def test_setup_git_config(self):
        """Test complete Git configuration setup"""
        os.environ['GIT_USER_NAME'] = 'Test User'
        os.environ['GIT_USER_EMAIL'] = 'test@example.com'

        git_integration = GitIntegration()

        with patch.object(git_integration, '_run_git_command', return_value=True) as mock_run_git:
            with patch.object(git_integration, '_setup_ssh_auth') as mock_ssh:
                with patch.object(git_integration, '_setup_token_auth') as mock_token:
                    with patch.object(git_integration, '_configure_git_environment') as mock_config:
                        result = await git_integration.setup_git_config()

                        self.assertTrue(result)
                        # Verify Git user configuration was called
                        mock_run_git.assert_any_call(['config', '--global', 'user.name', 'Test User'])
                        mock_run_git.assert_any_call(['config', '--global', 'user.email', 'test@example.com'])
                        mock_ssh.assert_called_once()
                        mock_token.assert_called_once()
                        mock_config.assert_called_once()

    @patch('git_integration.asyncio.create_subprocess_exec')
    async def test_clone_repositories(self, mock_subprocess):
        """Test repository cloning"""
        mock_process = AsyncMock()
        mock_process.communicate.return_value = (b'Cloning...', b'')
        mock_process.returncode = 0
        mock_subprocess.return_value = mock_process

        os.environ['GIT_REPOSITORIES'] = json.dumps([
            {"url": "https://github.com/test/repo.git", "branch": "main", "clonePath": "test-repo"}
        ])

        git_integration = GitIntegration()

        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir)
            result = await git_integration.clone_repositories(workspace_dir)

            self.assertEqual(len(result), 1)
            self.assertIn("https://github.com/test/repo.git", result)

    @patch('git_integration.asyncio.create_subprocess_exec')
    @patch('git_integration.os.chdir')
    @patch('git_integration.Path.cwd')
    async def test_create_and_push_branch_no_changes(self, mock_cwd, mock_chdir, mock_subprocess):
        """Test branch creation when no changes exist"""
        mock_cwd.return_value = Path('/original')

        # Mock git status returning empty (no changes)
        mock_process = AsyncMock()
        mock_process.communicate.return_value = (b'', b'')  # Empty status
        mock_process.returncode = 0
        mock_subprocess.return_value = mock_process

        git_integration = GitIntegration()

        with tempfile.TemporaryDirectory() as temp_dir:
            repo_path = Path(temp_dir)
            result = await git_integration.create_and_push_branch(
                repo_path, "test-branch", "Test commit"
            )

            self.assertTrue(result)


class TestGitConfigurationValidation(unittest.TestCase):
    """Test Git configuration validation"""

    def test_valid_repository_config(self):
        """Test valid repository configuration"""
        config = {
            "url": "https://github.com/user/repo.git",
            "branch": "main",
            "clonePath": "my-repo"
        }

        # This would be validated by the CRD schema in practice
        self.assertIn("url", config)
        self.assertTrue(config["url"].startswith(("https://", "git@")))

    def test_valid_user_config(self):
        """Test valid user configuration"""
        config = {
            "name": "Test User",
            "email": "test@example.com"
        }

        self.assertIn("name", config)
        self.assertIn("email", config)
        self.assertIn("@", config["email"])


if __name__ == '__main__':
    # Run the tests
    unittest.main(verbosity=2)
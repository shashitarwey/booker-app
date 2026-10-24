import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { vi } from 'vitest';

// Mock the API module
vi.mock('../api', () => ({
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  clearApiCache: vi.fn(),
}));

import { loginUser, registerUser } from '../api';

// Test component to access context
function TestConsumer() {
  const { user, token, login, register, logout } = useAuth();
  return (
    <div>
      <span data-testid="user">{user ? user.name : 'none'}</span>
      <span data-testid="token">{token || 'no-token'}</span>
      <button onClick={() => login('test@test.com', 'pass')}>Login</button>
      <button onClick={() => register('Test', 'test@test.com', 'pass')}>Register</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AuthContext', () => {
  it('starts with no user when localStorage is empty', () => {
    render(
      <AuthProvider><TestConsumer /></AuthProvider>
    );
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('token')).toHaveTextContent('no-token');
  });

  it('restores user from localStorage', () => {
    localStorage.setItem('cv_token', 'saved-token');
    localStorage.setItem('cv_user', JSON.stringify({ name: 'Saved User' }));

    render(
      <AuthProvider><TestConsumer /></AuthProvider>
    );
    expect(screen.getByTestId('user')).toHaveTextContent('Saved User');
    expect(screen.getByTestId('token')).toHaveTextContent('saved-token');
  });

  it('login sets user and token', async () => {
    loginUser.mockResolvedValue({ token: 'jwt-123', user: { name: 'Shashi' } });

    render(
      <AuthProvider><TestConsumer /></AuthProvider>
    );

    await userEvent.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('Shashi');
      expect(screen.getByTestId('token')).toHaveTextContent('jwt-123');
    });
    expect(localStorage.getItem('cv_token')).toBe('jwt-123');
  });

  it('register sets user and token', async () => {
    registerUser.mockResolvedValue({ token: 'jwt-456', user: { name: 'New User' } });

    render(
      <AuthProvider><TestConsumer /></AuthProvider>
    );

    await userEvent.click(screen.getByText('Register'));

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('New User');
    });
  });

  it('logout clears user, token, and localStorage', async () => {
    localStorage.setItem('cv_token', 'old-token');
    localStorage.setItem('cv_user', JSON.stringify({ name: 'Old' }));

    render(
      <AuthProvider><TestConsumer /></AuthProvider>
    );

    await userEvent.click(screen.getByText('Logout'));

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('none');
      expect(screen.getByTestId('token')).toHaveTextContent('no-token');
    });
    expect(localStorage.getItem('cv_token')).toBeNull();
    expect(localStorage.getItem('cv_user')).toBeNull();
  });
});

import { userService } from '../../../services/userService';
import { prisma } from '../../../config/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('../../../config/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('bcryptjs', () => ({
  genSalt: jest.fn().mockResolvedValue('salt'),
  hash: jest.fn().mockResolvedValue('hashedPassword'),
  compare: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('test-token'),
}));

jest.mock('../../../utils/emailSender', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerData = {
      email: 'test@example.com',
      password: 'Password123',
      name: 'Test User',
      phoneNumber: '+380501234567',
    };

    const mockUser = {
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      role: 'USER',
      isVerified: false,
    };

    it('should successfully register a new user', async () => {
      // Mock user doesn't exist
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      
      // Mock user creation
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await userService.register(registerData);

      // Verify dependencies were called correctly
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: registerData.email },
      });
      
      expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
      expect(bcrypt.hash).toHaveBeenCalledWith(registerData.password, 'salt');
      
      expect(prisma.user.create).toHaveBeenCalled();
      expect(jwt.sign).toHaveBeenCalled();

      // Verify result structure
      expect(result).toHaveProperty('token', 'test-token');
      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('id', mockUser.id);
      expect(result.user).toHaveProperty('email', mockUser.email);
    });

    it('should throw error if user already exists', async () => {
      // Mock user already exists
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(userService.register(registerData)).rejects.toThrow(
        'User with this email already exists'
      );
    });
  });

  describe('login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'Password123',
    };

    const mockUser = {
      id: 1,
      email: 'test@example.com',
      passwordHash: 'hashedPassword',
      name: 'Test User',
      role: 'USER',
      isVerified: true,
    };

    it('should successfully login a user with valid credentials', async () => {
      // Mock user exists
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      
      // Mock password is valid
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await userService.login(loginData);

      // Verify dependencies were called correctly
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginData.email },
      });
      
      expect(bcrypt.compare).toHaveBeenCalledWith(
        loginData.password,
        mockUser.passwordHash
      );
      
      expect(jwt.sign).toHaveBeenCalled();

      // Verify result structure
      expect(result).toHaveProperty('token', 'test-token');
      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('id', mockUser.id);
      expect(result.user).toHaveProperty('email', mockUser.email);
    });

    it('should throw error if user not found', async () => {
      // Mock user doesn't exist
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(userService.login(loginData)).rejects.toThrow(
        'Invalid credentials'
      );
    });

    it('should throw error if password is invalid', async () => {
      // Mock user exists
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      
      // Mock password is invalid
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(userService.login(loginData)).rejects.toThrow(
        'Invalid credentials'
      );
    });
  });

  // Add more tests for other methods...
});
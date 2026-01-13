// Mock dependencies FIRST before any imports
jest.mock('../../../src/models');
jest.mock('bcryptjs');

// Import after mocks
const userService = require('../../../src/services/user.service');
const { userModel } = require('../../../src/models');
const bcrypt = require('bcryptjs');
const ApiError = require('../../../src/utils/ApiError');
const { generateFakeUser } = require('../../utils/testHelpers');
const httpStatus = require('http-status');

describe('User Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserById', () => {
    it('should get user by ID successfully', async () => {
      const mockUser = generateFakeUser({ id: 1 });
      userModel.getUserById.mockResolvedValue(mockUser);

      const result = await userService.getUserById(1);

      expect(userModel.getUserById).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockUser);
    });

    it('should return null if user not found', async () => {
      userModel.getUserById.mockResolvedValue(null);

      const result = await userService.getUserById(999);

      expect(result).toBeNull();
    });
  });

  describe('getUserByEmail', () => {
    const email = 'test@example.com';

    it('should get user by email successfully', async () => {
      const mockUser = generateFakeUser({ email });
      userModel.getUserByEmail.mockResolvedValue(mockUser);

      const result = await userService.getUserByEmail(email);

      expect(userModel.getUserByEmail).toHaveBeenCalledWith(email);
      expect(result).toEqual(mockUser);
    });

    it('should return null if user not found', async () => {
      userModel.getUserByEmail.mockResolvedValue(null);

      const result = await userService.getUserByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('createUser', () => {
    const userBody = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      role: 'user',
    };

    it('should create user successfully', async () => {
      const hashedPassword = 'hashed_password_123';
      const mockUser = generateFakeUser({ ...userBody, password: hashedPassword });
      const originalPassword = userBody.password;

      userModel.getUserByEmail.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue(hashedPassword);
      userModel.createUser.mockResolvedValue(mockUser);

      const result = await userService.createUser(userBody);

      expect(userModel.getUserByEmail).toHaveBeenCalledWith(userBody.email);
      expect(bcrypt.hash).toHaveBeenCalledWith(originalPassword, 8);
      expect(userModel.createUser).toHaveBeenCalledWith({
        name: userBody.name,
        email: userBody.email,
        role: userBody.role,
        password: hashedPassword,
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw error if email already exists', async () => {
      const existingUser = generateFakeUser({ email: userBody.email });
      userModel.getUserByEmail.mockResolvedValue(existingUser);

      await expect(userService.createUser(userBody)).rejects.toThrow(ApiError);
      await expect(userService.createUser(userBody)).rejects.toThrow('e-Posta daha önce alınmış');
    });

    it('should hash password before creating user', async () => {
      const hashedPassword = 'hashed_password_123';
      userModel.getUserByEmail.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue(hashedPassword);
      userModel.createUser.mockResolvedValue(generateFakeUser());

      await userService.createUser(userBody);

      expect(bcrypt.hash).toHaveBeenCalledWith(userBody.password, 8);
    });
  });

  describe('updateUserById', () => {
    const userId = 1;
    const updateBody = {
      name: 'Updated User',
      email: 'updated@example.com',
    };

    it('should update user successfully', async () => {
      const mockUser = generateFakeUser({ id: userId });
      const updatedUser = { ...mockUser, ...updateBody };

      userModel.getUserById.mockResolvedValue(mockUser);
      userModel.findUser.mockResolvedValue(null);
      userModel.updateUserById.mockResolvedValue(updatedUser);

      const result = await userService.updateUserById(userId, updateBody);

      expect(userModel.getUserById).toHaveBeenCalledWith(userId);
      expect(userModel.updateUserById).toHaveBeenCalledWith(userId, updateBody);
      expect(result).toEqual(updatedUser);
    });

    it('should throw error if user not found', async () => {
      userModel.getUserById.mockResolvedValue(null);

      await expect(userService.updateUserById(userId, updateBody)).rejects.toThrow(ApiError);
      await expect(userService.updateUserById(userId, updateBody)).rejects.toThrow('Kullanıcı bulunamadı');
    });

    it('should throw error if new email already exists for another user', async () => {
      const mockUser = generateFakeUser({ id: userId });
      const existingUser = generateFakeUser({ id: 2, email: updateBody.email });

      userModel.getUserById.mockResolvedValue(mockUser);
      userModel.findUser.mockResolvedValue(existingUser);

      await expect(userService.updateUserById(userId, updateBody)).rejects.toThrow(ApiError);
      await expect(userService.updateUserById(userId, updateBody)).rejects.toThrow('e-Posta daha önce alınmış');
    });

    it('should hash password if password is being updated', async () => {
      const mockUser = generateFakeUser({ id: userId });
      const hashedPassword = 'hashed_new_password';
      const updateWithPassword = { ...updateBody, password: 'newpassword123' };

      userModel.getUserById.mockResolvedValue(mockUser);
      userModel.findUser.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue(hashedPassword);
      userModel.updateUserById.mockResolvedValue({ ...mockUser, password: hashedPassword });

      await userService.updateUserById(userId, updateWithPassword);

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword123', 8);
      expect(userModel.updateUserById).toHaveBeenCalledWith(userId, {
        ...updateBody,
        password: hashedPassword,
      });
    });

    it('should allow updating to same email', async () => {
      const mockUser = generateFakeUser({ id: userId, email: 'same@example.com' });
      const updateWithSameEmail = { email: 'same@example.com' };

      userModel.getUserById.mockResolvedValue(mockUser);
      userModel.findUser.mockResolvedValue(null);
      userModel.updateUserById.mockResolvedValue(mockUser);

      await userService.updateUserById(userId, updateWithSameEmail);

      expect(userModel.findUser).toHaveBeenCalledWith({ email: 'same@example.com', NOT: { id: userId } });
    });
  });

  describe('deleteUserById', () => {
    const userId = 1;
    const adminId = 2;

    it('should delete user successfully', async () => {
      const mockUser = generateFakeUser({ id: userId });
      userModel.deleteUserById.mockResolvedValue(mockUser);

      const result = await userService.deleteUserById(userId, adminId);

      expect(userModel.deleteUserById).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockUser);
    });

    it('should throw error if user tries to delete themselves', async () => {
      await expect(userService.deleteUserById(userId, userId)).rejects.toThrow(ApiError);
      await expect(userService.deleteUserById(userId, userId)).rejects.toThrow('Kendi hesabınızı silemezsiniz');
    });

    it('should allow admin to delete other users', async () => {
      const mockUser = generateFakeUser({ id: userId });
      userModel.deleteUserById.mockResolvedValue(mockUser);

      await userService.deleteUserById(userId, adminId);

      expect(userModel.deleteUserById).toHaveBeenCalledWith(userId);
    });
  });

  describe('getUsersList', () => {
    it('should get all users successfully', async () => {
      const mockUsers = [
        generateFakeUser({ id: 1, email: 'user1@example.com' }),
        generateFakeUser({ id: 2, email: 'user2@example.com' }),
        generateFakeUser({ id: 3, email: 'user3@example.com' }),
      ];

      userModel.getUsers.mockResolvedValue(mockUsers);

      const result = await userService.getUsersList();

      expect(userModel.getUsers).toHaveBeenCalled();
      expect(result).toEqual(mockUsers);
      expect(result).toHaveLength(3);
    });

    it('should return empty array if no users found', async () => {
      userModel.getUsers.mockResolvedValue([]);

      const result = await userService.getUsersList();

      expect(result).toEqual([]);
    });
  });

  describe('isPasswordMatch', () => {
    const password = 'password123';
    const hashedPassword = 'hashed_password_123';

    it('should return true if password matches', async () => {
      const mockUser = generateFakeUser({ password: hashedPassword });
      bcrypt.compare.mockResolvedValue(true);

      const result = await userService.isPasswordMatch(password, mockUser);

      expect(bcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(result).toBe(true);
    });

    it('should return false if password does not match', async () => {
      const mockUser = generateFakeUser({ password: hashedPassword });
      bcrypt.compare.mockResolvedValue(false);

      const result = await userService.isPasswordMatch('wrongpassword', mockUser);

      expect(bcrypt.compare).toHaveBeenCalledWith('wrongpassword', hashedPassword);
      expect(result).toBe(false);
    });

    it('should handle empty password', async () => {
      const mockUser = generateFakeUser({ password: hashedPassword });
      bcrypt.compare.mockResolvedValue(false);

      const result = await userService.isPasswordMatch('', mockUser);

      expect(result).toBe(false);
    });
  });
});

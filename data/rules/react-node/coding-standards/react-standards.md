# React Coding Standards

Follow these coding standards when developing React applications.

## Project Structure

```
src/
├── components/           # Reusable UI components
│   ├── common/          # Generic components (Button, Input)
│   └── features/        # Feature-specific components
├── hooks/               # Custom React hooks
├── pages/               # Page components (routes)
├── services/            # API and external services
├── store/               # State management
├── types/               # TypeScript types/interfaces
├── utils/               # Utility functions
├── styles/              # Global styles
└── App.tsx
```

## Naming Conventions

- **Components**: PascalCase (e.g., `UserProfile.tsx`)
- **Hooks**: camelCase with "use" prefix (e.g., `useAuth.ts`)
- **Utilities**: camelCase (e.g., `formatDate.ts`)
- **Types**: PascalCase with descriptive suffix (e.g., `UserDTO`, `AuthState`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `API_BASE_URL`)

## Component Patterns

### Functional Components with TypeScript

```tsx
import { FC, useState, useCallback } from 'react';

interface UserCardProps {
  user: User;
  onSelect?: (userId: string) => void;
  isSelected?: boolean;
}

export const UserCard: FC<UserCardProps> = ({ 
  user, 
  onSelect, 
  isSelected = false 
}) => {
  const handleClick = useCallback(() => {
    onSelect?.(user.id);
  }, [user.id, onSelect]);

  return (
    <div 
      className={`user-card ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
    >
      <img src={user.avatar} alt={user.name} />
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  );
};
```

### Component Organization

```tsx
// 1. Imports
import { FC, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

// 2. Types
interface Props {
  id: string;
}

// 3. Constants
const REFRESH_INTERVAL = 5000;

// 4. Component
export const DataDisplay: FC<Props> = ({ id }) => {
  // 4a. Hooks
  const [isExpanded, setIsExpanded] = useState(false);
  const { data, isLoading } = useQuery(['data', id], fetchData);
  
  // 4b. Effects
  useEffect(() => {
    // Effect logic
  }, [id]);
  
  // 4c. Handlers
  const handleToggle = () => setIsExpanded(!isExpanded);
  
  // 4d. Render helpers
  const renderContent = () => {
    if (isLoading) return <Spinner />;
    return <DataContent data={data} />;
  };
  
  // 4e. Return
  return (
    <div>
      <button onClick={handleToggle}>Toggle</button>
      {isExpanded && renderContent()}
    </div>
  );
};
```

## Import Order

1. React and React-related
2. Third-party libraries
3. Internal modules (absolute imports)
4. Relative imports
5. Styles

```tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';

import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/services/api';

import { UserCard } from './UserCard';
import { formatDate } from './utils';

import styles from './Dashboard.module.css';
```

## TypeScript Best Practices

```tsx
// Use interfaces for props and public APIs
interface ButtonProps {
  variant: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
}

// Use type for unions and computed types
type ButtonSize = ButtonProps['size'];
type Status = 'idle' | 'loading' | 'success' | 'error';

// Avoid any - use unknown for truly unknown types
function parseResponse(data: unknown): User {
  // Validate and type-guard
  if (isUser(data)) {
    return data;
  }
  throw new Error('Invalid user data');
}
```

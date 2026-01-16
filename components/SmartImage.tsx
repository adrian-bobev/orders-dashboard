'use client';

import Image, { ImageProps } from 'next/image';
import React from 'react';

/**
 * SmartImage component that handles different types of image sources
 * - Automatically detects signed URLs, data URLs, and API proxy URLs
 * - Uses native <img> for signed URLs and data URLs to avoid Next.js domain restrictions
 * - Uses Next.js Image component for standard URLs for optimization
 * - In development mode, shows placeholders instead of fetching from R2
 */
export interface SmartImageProps extends Omit<ImageProps, 'src'> {
  src: string;
  imgClassName?: string;
}

export const SmartImage: React.FC<SmartImageProps> = ({
  src,
  imgClassName,
  alt,
  ...rest
}) => {
  // Guard against undefined/null inputs
  if (!src || typeof src !== 'string') {
    const fallbackClass =
      imgClassName ||
      (rest && typeof (rest as { className?: string }).className === 'string'
        ? (rest as { className?: string }).className
        : '');
    return (
      <div
        className={fallbackClass}
        style={{
          background: '#eee',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          color: '#666',
        }}
      >
        no-img
      </div>
    );
  }

  const lower = src.toLowerCase();
  const isSigned =
    lower.includes('x-amz-signature=') || lower.includes('x-amz-algorithm=');
  const isData = lower.startsWith('data:');
  const isApiProxy = lower.includes('/api/images');

  // Bypass Next.js Image for signed URLs, data URLs, and our API proxy
  if (isSigned || isData || isApiProxy) {
    const { className, style, width, height, sizes } = rest as Pick<
      ImageProps,
      'className' | 'style' | 'width' | 'height' | 'sizes'
    > & { fill?: boolean };
    const fill: boolean | undefined = (
      rest as unknown as { fill?: boolean }
    ).fill;

    const finalStyle: React.CSSProperties = { ...style };

    if (fill) {
      finalStyle.position = 'absolute';
      (finalStyle as unknown as { inset?: number | string }).inset = 0;
      finalStyle.width = '100%';
      finalStyle.height = '100%';
      finalStyle.objectFit = finalStyle.objectFit || 'cover';
    }

    return (
      <img
        loading="eager"
        src={src}
        alt={alt || ''}
        className={imgClassName || className}
        style={finalStyle}
        width={
          !fill && typeof width === 'number' ? width : undefined
        }
        height={
          !fill && typeof height === 'number' ? height : undefined
        }
        sizes={sizes}
      />
    );
  }

  // Use Next.js Image for standard URLs
  return <Image src={src} alt={alt} {...rest} />;
};

export default SmartImage;

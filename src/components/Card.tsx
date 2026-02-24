'use client'

import Image from 'next/image'

interface CardProps {
  code: string
  name: string
  rarity: string
  type: string
  image_url: string
}

export default function Card({
  code,
  name,
  rarity,
  type,
  image_url
}: CardProps) {
  return (
    <div className="card-container">
      <div className="image-wrapper">
        <Image
          src={image_url}
          alt={name}
          width={250}
          height={350}
          className="card-image"
        />
        <span className={`rarity-badge rarity-${rarity}`}>{rarity}</span>
      </div>

      <div className="card-info">
        <div className="card-code">{code}</div>
        <div className="card-name">{name}</div>
        <div className="card-type">{type}</div>
      </div>

      <style jsx>{`
        .card-container {
          position: relative;
          background: #1e1e1e;
          border-radius: 8px;
          padding: 8px;
          color: white;
        }

        .image-wrapper {
          position: relative;
        }

        .card-image {
          border-radius: 6px;
        }

        .rarity-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 2px 6px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
        }

        .rarity-SR {
          background: #c0392b;
        }

        .rarity-SEC {
          background: #8e44ad;
        }

        .rarity-L {
          background: #f39c12;
        }

        .rarity-R {
          background: #2980b9;
        }

        .rarity-UC {
          background: #16a085;
        }

        .rarity-C {
          background: #7f8c8d;
        }

        .card-info {
          margin-top: 8px;
        }

        .card-code {
          font-size: 12px;
          opacity: 0.8;
        }

        .card-name {
          font-weight: 600;
        }

        .card-type {
          font-size: 12px;
          opacity: 0.7;
        }
      `}</style>
    </div>
  )
}

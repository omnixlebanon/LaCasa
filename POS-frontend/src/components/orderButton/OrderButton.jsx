import React from 'react';
import './OrderButton.css'; // Make sure the path matches your project layout
import { useCurrency } from '../../global';
function OrderButton({ data, onClick }) {
    const product = data?.data ? data.data : data;
    const { formatPrice } = useCurrency();
    if (!product) return null;

    return (
        <button className="product-card-btn" onClick={onClick}>
            <div className="card-badge-container">
                <span className="category-badge">
                    {product.product_category?.toUpperCase() || "CATEGORY"}
                </span>
            </div>
            <h3 className="product-title">
                {product.product_name || "Product Name"}
            </h3>
            <div className="price-tag">
               
                {formatPrice(product.product_price || 0)}
            </div>
        </button>
    );
}

export default OrderButton;

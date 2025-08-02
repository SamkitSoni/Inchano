import { useState, useEffect, useCallback } from 'react';
import { relayerApi, CreateOrderRequest, DutchAuctionOrder, OrderListResponse } from '@/lib/api';

// Hook for managing orders
export function useOrders() {
  const [orders, setOrders] = useState<DutchAuctionOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await relayerApi.getOrders();

    if (response.success) {
      setOrders(response.data?.orders || []);
    } else {
      setError(response.error || 'Failed to fetch orders');
    }
    setLoading(false);
  }, []);

  const createOrder = useCallback(async (orderData: CreateOrderRequest) => {
    setLoading(true);
    setError(null);
    const response = await relayerApi.createOrder(orderData);

    if (response.success) {
      fetchOrders(); // Refresh list
    } else {
      setError(response.error || 'Failed to create order');
    }
    setLoading(false);
  }, [fetchOrders]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return {
    orders,
    loading,
    error,
    createOrder,
    fetchOrders
  };
}


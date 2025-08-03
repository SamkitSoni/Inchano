import React from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface SignatureValidationModalProps {
  isOpen: boolean;
  stage: 'signing' | 'validating' | 'success' | 'error';
  message?: string;
  onClose?: () => void;
  onRetry?: () => void;
}

export function SignatureValidationModal({
  isOpen,
  stage,
  message,
  onClose,
  onRetry
}: SignatureValidationModalProps) {
  if (!isOpen) return null;

  const getStageContent = () => {
    switch (stage) {
      case 'signing':
        return {
          icon: <Loader2 className="h-8 w-8 animate-spin text-blue-400" />,
          title: 'Sign Order',
          description: 'Please sign the order in your wallet to continue',
          showRetry: false
        };
      case 'validating':
        return {
          icon: <Loader2 className="h-8 w-8 animate-spin text-yellow-400" />,
          title: 'Validating Signature',
          description: 'Verifying your signature and processing the order...',
          showRetry: false
        };
      case 'success':
        return {
          icon: <CheckCircle className="h-8 w-8 text-green-400" />,
          title: 'Order Created Successfully!',
          description: message || 'Your limit order has been created and is ready for the Dutch auction',
          showRetry: false
        };
      case 'error':
        return {
          icon: <AlertCircle className="h-8 w-8 text-red-400" />,
          title: 'Order Creation Failed',
          description: message || 'Failed to create order. Please try again.',
          showRetry: true
        };
      default:
        return {
          icon: <Loader2 className="h-8 w-8 animate-spin text-blue-400" />,
          title: 'Processing...',
          description: 'Please wait while we process your request',
          showRetry: false
        };
    }
  };

  const { icon, title, description, showRetry } = getStageContent();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="p-8 bg-black/80 backdrop-blur-xl border-white/20 shadow-2xl max-w-md w-full mx-4">
        <div className="text-center space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            {icon}
          </div>

          {/* Content */}
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-white">
              {title}
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              {description}
            </p>
          </div>

          {/* Progress indicators for multi-step process */}
          {(stage === 'signing' || stage === 'validating') && (
            <div className="flex justify-center space-x-2">
              <div className={`h-2 w-8 rounded-full ${
                stage === 'signing' ? 'bg-blue-400' : 'bg-blue-600'
              }`} />
              <div className={`h-2 w-8 rounded-full ${
                stage === 'validating' ? 'bg-yellow-400' : 'bg-gray-600'
              }`} />
              <div className="h-2 w-8 rounded-full bg-gray-600" />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-4">
            {showRetry && onRetry && (
              <Button
                onClick={onRetry}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                Try Again
              </Button>
            )}
            
            {(stage === 'success' || stage === 'error') && onClose && (
              <Button
                onClick={onClose}
                variant={stage === 'success' ? 'default' : 'outline'}
                className={`flex-1 ${
                  stage === 'success' 
                    ? 'bg-green-600 hover:bg-green-700 text-white' 
                    : 'border-white/20 text-white hover:bg-white/10'
                }`}
              >
                {stage === 'success' ? 'Start Auction' : 'Close'}
              </Button>
            )}
          </div>

          {/* Tips for signing stage */}
          {stage === 'signing' && (
            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-blue-300 text-xs">
                💡 Check your wallet for the signature request. This creates a limit order for the Dutch auction.
              </p>
            </div>
          )}

          {/* Tips for validation stage */}
          {stage === 'validating' && (
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-yellow-300 text-xs">
                🔍 Verifying your signature with EIP-712 and checking order parameters...
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

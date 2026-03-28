import { useNavigate } from "react-router-dom";

import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";

export default function PaymentCancelPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white shadow-lg">
        <CardContent className="flex flex-col items-center text-center py-10 px-6">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <span className="text-2xl">🛒</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Payment Cancelled</h2>
          <p className="text-sm text-gray-500 mb-6">
            No worries — you weren't charged. You can purchase a bundle anytime from the dashboard.
          </p>
          <Button
            onClick={() => navigate("/parent-dashboard")}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            Back to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/app/components/ui/select";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertCircle, Loader2, CheckCircle, XCircle } from "lucide-react";

import { createChild, checkUsername } from "@/app/utils/childrenApi";

export default function AddChildDialog({ open, onOpenChange, onChildCreated }) {
  const [form, setForm] = useState({
    display_name: "",
    username: "",
    pin: "",
    confirmPin: "",
    year_level: "",
  });
  const [usernameStatus, setUsernameStatus] = useState("idle"); // idle | checking | available | taken | invalid
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setForm({ display_name: "", username: "", pin: "", confirmPin: "", year_level: "" });
      setUsernameStatus("idle");
      setError("");
    }
  }, [open]);

  // Live username check with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const u = form.username.trim().toLowerCase();

    if (!u || u.length < 3) {
      setUsernameStatus(u.length > 0 ? "invalid" : "idle");
      return;
    }

    if (!/^[a-z0-9_]{3,20}$/.test(u)) {
      setUsernameStatus("invalid");
      return;
    }

    setUsernameStatus("checking");

    debounceRef.current = setTimeout(async () => {
      try {
        const data = await checkUsername(u);
        setUsernameStatus(data.available ? "available" : "taken");
      } catch {
        setUsernameStatus("idle");
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form.username]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
  };

  const pinValid = /^\d{4,6}$/.test(form.pin);
  const pinsMatch = form.pin === form.confirmPin && form.confirmPin.length > 0;

  const canSubmit =
    form.display_name.trim() &&
    usernameStatus === "available" &&
    pinValid &&
    pinsMatch &&
    form.year_level &&
    !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);

    try {
      const child = await createChild({
        display_name: form.display_name.trim(),
        username: form.username.trim().toLowerCase(),
        pin: form.pin,
        year_level: Number(form.year_level),
      });
      onChildCreated?.(child);
      onOpenChange(false);
    } catch (err) {
      setError(err.message || "Failed to create child profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a Child</DialogTitle>
          <DialogDescription>Create a profile for your child to start taking practice tests.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="display_name">Display Name</Label>
            <Input
              id="display_name"
              value={form.display_name}
              onChange={(e) => updateField("display_name", e.target.value)}
              placeholder="e.g. Sarah"
              disabled={loading}
            />
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={form.username}
              onChange={(e) => updateField("username", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="e.g. sarah_y3"
              maxLength={20}
              disabled={loading}
            />
            <div className="flex items-center gap-1.5 text-xs min-h-[20px]">
              {usernameStatus === "checking" && (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                  <span className="text-gray-400">Checking...</span>
                </>
              )}
              {usernameStatus === "available" && (
                <>
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-green-600">Username available</span>
                </>
              )}
              {usernameStatus === "taken" && (
                <>
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-red-600">Username taken</span>
                </>
              )}
              {usernameStatus === "invalid" && (
                <span className="text-gray-400">3–20 chars: lowercase letters, numbers, underscores</span>
              )}
            </div>
          </div>

          {/* Year Level */}
          <div className="space-y-2">
            <Label>Year Level</Label>
            <Select
              value={form.year_level}
              onValueChange={(v) => updateField("year_level", v)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select year level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Year 3</SelectItem>
                <SelectItem value="5">Year 5</SelectItem>
                <SelectItem value="7">Year 7</SelectItem>
                <SelectItem value="9">Year 9</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* PIN */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pin">PIN (4–6 digits)</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={form.pin}
                onChange={(e) => updateField("pin", e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPin">Confirm PIN</Label>
              <Input
                id="confirmPin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={form.confirmPin}
                onChange={(e) => updateField("confirmPin", e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                disabled={loading}
              />
            </div>
          </div>
          {form.confirmPin.length > 0 && !pinsMatch && (
            <p className="text-xs text-red-500 -mt-2">PINs do not match</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={!canSubmit}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Child"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

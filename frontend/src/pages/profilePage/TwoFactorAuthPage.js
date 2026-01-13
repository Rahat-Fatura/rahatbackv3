import React, { useState, useEffect } from "react";
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Box,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  FormControlLabel,
} from "@mui/material";
import { Security, QrCode2 } from "@mui/icons-material";
import Swal from "sweetalert2";
import {
  get2FAStatus,
  generate2FA,
  enable2FA,
  disable2FA,
} from "../../api/auth/twoFactor";

const TwoFactorAuthPage = () => {
  const [loading, setLoading] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);

  // Setup states
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [setupStep, setSetupStep] = useState(1); // 1: QR Code, 2: Verify

  // Disable states
  const [disableToken, setDisableToken] = useState("");

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await get2FAStatus();
      setTwoFactorEnabled(response.data.twoFactorEnabled);
    } catch (error) {
      console.error("Failed to fetch 2FA status:", error);
      Swal.fire({
        title: "Hata",
        text: "2FA durumu alınamadı",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEnableClick = async () => {
    setLoading(true);
    try {
      const response = await generate2FA();
      setQrCode(response.data.qrCode);
      setSecret(response.data.secret);
      setShowSetupModal(true);
      setSetupStep(1);
    } catch (error) {
      console.error("Failed to generate 2FA:", error);
      Swal.fire({
        title: "Hata",
        text: "QR kod oluşturulamadı",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (verificationToken.length !== 6) {
      Swal.fire({
        title: "Hata",
        text: "Lütfen 6 haneli kodu girin",
        icon: "warning",
      });
      return;
    }

    setLoading(true);
    try {
      await enable2FA(verificationToken);
      Swal.fire({
        title: "Başarılı!",
        text: "İki faktörlü doğrulama aktif edildi",
        icon: "success",
      });
      setTwoFactorEnabled(true);
      setShowSetupModal(false);
      setVerificationToken("");
      setQrCode("");
      setSecret("");
    } catch (error) {
      console.error("Failed to enable 2FA:", error);
      Swal.fire({
        title: "Hata",
        text: error?.response?.data?.message || "Doğrulama başarısız",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (disableToken.length !== 6) {
      Swal.fire({
        title: "Hata",
        text: "Lütfen 6 haneli kodu girin",
        icon: "warning",
      });
      return;
    }

    setLoading(true);
    try {
      await disable2FA(disableToken);
      Swal.fire({
        title: "Başarılı!",
        text: "İki faktörlü doğrulama devre dışı bırakıldı",
        icon: "success",
      });
      setTwoFactorEnabled(false);
      setShowDisableModal(false);
      setDisableToken("");
    } catch (error) {
      console.error("Failed to disable 2FA:", error);
      Swal.fire({
        title: "Hata",
        text: error?.response?.data?.message || "İşlem başarısız",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading && !showSetupModal && !showDisableModal) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Grid container spacing={3} sx={{ p: 3 }}>
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" mb={2}>
              <Security sx={{ fontSize: 40, mr: 2, color: "primary.main" }} />
              <Box>
                <Typography variant="h5" gutterBottom>
                  İki Faktörlü Doğrulama (2FA)
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Hesabınıza ekstra güvenlik katmanı ekleyin
                </Typography>
              </Box>
            </Box>

            <Alert severity={twoFactorEnabled ? "success" : "info"} sx={{ mb: 3 }}>
              {twoFactorEnabled
                ? "İki faktörlü doğrulama aktif. Hesabınız ekstra güvenlik ile korunuyor."
                : "İki faktörlü doğrulama aktif değil. Hesabınızı daha güvenli hale getirmek için aktif edin."}
            </Alert>

            <FormControlLabel
              control={
                <Switch
                  checked={twoFactorEnabled}
                  onChange={(e) => {
                    if (e.target.checked) {
                      handleEnableClick();
                    } else {
                      setShowDisableModal(true);
                    }
                  }}
                  color="primary"
                />
              }
              label={twoFactorEnabled ? "İki Faktörlü Doğrulama Aktif" : "İki Faktörlü Doğrulama Pasif"}
            />

            <Box mt={3}>
              <Typography variant="h6" gutterBottom>
                Nasıl Çalışır?
              </Typography>
              <Typography variant="body2" color="textSecondary" paragraph>
                1. Google Authenticator veya Authy gibi bir authenticator uygulaması indirin
              </Typography>
              <Typography variant="body2" color="textSecondary" paragraph>
                2. QR kodu tarayın veya secret key'i manuel olarak girin
              </Typography>
              <Typography variant="body2" color="textSecondary" paragraph>
                3. Uygulamanın ürettiği 6 haneli kodu girin
              </Typography>
              <Typography variant="body2" color="textSecondary">
                4. Artık giriş yaparken şifrenizle birlikte authenticator uygulamasından kod girmeniz gerekecek
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Setup Modal */}
      <Dialog
        open={showSetupModal}
        onClose={() => {
          setShowSetupModal(false);
          setVerificationToken("");
          setSetupStep(1);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h5" align="center">
            İki Faktörlü Doğrulama Kurulumu
          </Typography>
        </DialogTitle>
        <DialogContent>
          {setupStep === 1 && (
            <Box sx={{ pt: 2 }}>
              <Typography variant="body1" gutterBottom align="center">
                1. Authenticator uygulamanızla QR kodu tarayın
              </Typography>
              <Box display="flex" justifyContent="center" my={3}>
                {qrCode && (
                  <img src={qrCode} alt="QR Code" style={{ maxWidth: "250px" }} />
                )}
              </Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>Manuel Giriş için Secret Key:</strong>
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: "monospace", mt: 1 }}>
                  {secret}
                </Typography>
              </Alert>
              <Typography variant="body2" color="textSecondary" align="center">
                QR kodu tarayamıyorsanız, yukarıdaki secret key'i manuel olarak girebilirsiniz.
              </Typography>
            </Box>
          )}

          {setupStep === 2 && (
            <Box sx={{ pt: 2 }}>
              <Typography variant="body1" gutterBottom align="center" sx={{ mb: 3 }}>
                2. Authenticator uygulamanızdan 6 haneli kodu girin
              </Typography>
              <TextField
                fullWidth
                variant="outlined"
                label="6 Haneli Kod"
                value={verificationToken}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, "");
                  if (value.length <= 6) {
                    setVerificationToken(value);
                  }
                }}
                inputProps={{
                  maxLength: 6,
                  style: { textAlign: "center", fontSize: "24px", letterSpacing: "8px" },
                }}
                autoFocus
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button
            onClick={() => {
              setShowSetupModal(false);
              setVerificationToken("");
              setSetupStep(1);
            }}
            variant="outlined"
          >
            İptal
          </Button>
          {setupStep === 1 ? (
            <Button
              onClick={() => setSetupStep(2)}
              variant="contained"
              startIcon={<QrCode2 />}
            >
              Devam Et
            </Button>
          ) : (
            <Button
              onClick={handleVerify}
              variant="contained"
              disabled={verificationToken.length !== 6 || loading}
            >
              {loading ? <CircularProgress size={24} /> : "Doğrula ve Aktif Et"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Disable Modal */}
      <Dialog
        open={showDisableModal}
        onClose={() => {
          setShowDisableModal(false);
          setDisableToken("");
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h5" align="center">
            2FA'yı Devre Dışı Bırak
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Alert severity="warning" sx={{ mb: 3 }}>
              İki faktörlü doğrulamayı kapatmak hesabınızı daha az güvenli hale getirir.
            </Alert>
            <Typography variant="body2" gutterBottom align="center" sx={{ mb: 3 }}>
              Devam etmek için authenticator uygulamanızdan kodu girin
            </Typography>
            <TextField
              fullWidth
              variant="outlined"
              label="6 Haneli Kod"
              value={disableToken}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9]/g, "");
                if (value.length <= 6) {
                  setDisableToken(value);
                }
              }}
              inputProps={{
                maxLength: 6,
                style: { textAlign: "center", fontSize: "24px", letterSpacing: "8px" },
              }}
              autoFocus
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button
            onClick={() => {
              setShowDisableModal(false);
              setDisableToken("");
            }}
            variant="outlined"
          >
            İptal
          </Button>
          <Button
            onClick={handleDisable}
            variant="contained"
            color="error"
            disabled={disableToken.length !== 6 || loading}
          >
            {loading ? <CircularProgress size={24} /> : "Devre Dışı Bırak"}
          </Button>
        </DialogActions>
      </Dialog>
    </Grid>
  );
};

export default TwoFactorAuthPage;

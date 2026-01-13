import PropTypes from "prop-types";
import { Box, Typography } from "@mui/material";
import TableViewIcon from "@mui/icons-material/TableView";
/**
 * Sayfa başlığı veya grid üstü göstermek için kullanılan ortak bileşen.
 *
 * @component
 * @example
 * // Kullanımı:
 * <GridHeader
 *   title="Yüklenen Defterler"
 *   length={42}
 *   icon={<FolderIcon sx={{ fontSize: 28 }} />}
 * />
 *
 * @param {Object} props - Bileşen propsları
 * @param {string} props.title - Başlık metni
 * @param {number} props.length - Toplam kayıt sayısı
 * @param {React.ReactNode} [props.icon] - Opsiyonel ikon, başlığın solunda gösterilir
 *
 * @returns {JSX.Element} Stilize edilmiş başlık kutusu
 */
const GridHeader = ({ title = "Başlık", length = "0", icon }) => {
  return (
    <Box
      sx={{
        background: "linear-gradient(135deg, #690c0c 0%, #764ba2 100%)",
        color: "white",
        padding: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        borderRadius: 1,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {icon || <TableViewIcon sx={{ fontSize: 28 }} />}
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          Toplam: {length} kayıt
        </Typography>
      </Box>
    </Box>
  );
};

export default GridHeader;

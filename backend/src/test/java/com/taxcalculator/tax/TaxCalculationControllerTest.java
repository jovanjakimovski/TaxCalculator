package com.taxcalculator.tax;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(TaxCalculationController.class)
class TaxCalculationControllerTest {
    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ExchangeRateService exchangeRateService;

    @Test
    void hasNoCsvUploadRoute() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "activity.csv", "text/csv", "private data".getBytes());

        mvc.perform(multipart("/api/tax/realized-gains").file(file))
                .andExpect(status().isNotFound());
    }
}